"""
Entity Resolver Service

Resolves email addresses from thread messages to customers and creates
thread_participants relationships for many-to-many thread-customer linking.
"""

import json
import logging
import os
from typing import Any, Dict, List, Optional, Set

import requests
from supabase import create_client, Client

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def get_supabase_client() -> Client:
    """Initialize and return Supabase client using service role key."""
    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    
    if not supabase_url:
        raise ValueError("SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL environment variable is required")
    if not supabase_key:
        raise ValueError("SUPABASE_SERVICE_ROLE_KEY environment variable is required")
    
    return create_client(supabase_url, supabase_key)


def trigger_analyze_thread_job(user_id: str, thread_id: str) -> None:
    """
    Trigger the 'analyze-thread' job via Trigger.dev.
    
    If Trigger.dev is not configured, falls back to calling the job directly.
    
    Args:
        user_id: UUID of the user
        thread_id: Thread ID to analyze
    """
    trigger_api_key = os.getenv("TRIGGER_API_KEY")
    trigger_endpoint = os.getenv("TRIGGER_ENDPOINT")  # Optional: custom endpoint
    
    # If Trigger.dev is configured, use HTTP API
    if trigger_api_key:
        try:
            # Trigger.dev API endpoint (adjust based on your setup)
            # This is a placeholder - adjust based on actual Trigger.dev API
            url = trigger_endpoint or "https://api.trigger.dev/v1/tasks/trigger"
            
            payload = {
                "taskId": "analyze-thread",
                "payload": {
                    "user_id": user_id,
                    "thread_id": thread_id
                }
            }
            
            headers = {
                "Authorization": f"Bearer {trigger_api_key}",
                "Content-Type": "application/json"
            }
            
            response = requests.post(url, json=payload, headers=headers, timeout=10)
            response.raise_for_status()
            logger.info(f"Successfully triggered Trigger.dev job for thread {thread_id}")
            return
            
        except Exception as e:
            logger.warning(f"Failed to trigger via Trigger.dev API: {str(e)}, falling back to direct call")
    
    # Fallback: Call the job function directly
    try:
        from backend.jobs.analysis_job import run_analyze_thread_job
        
        payload = {
            "user_id": user_id,
            "thread_id": thread_id
        }
        
        # Run in background (fire and forget)
        # In production, you might want to use a task queue here
        logger.info(f"Calling analyze-thread job directly for thread {thread_id}")
        run_analyze_thread_job(payload)
        
    except ImportError:
        logger.warning("Could not import analysis_job, skipping direct call")
    except Exception as e:
        logger.error(f"Error calling analyze-thread job directly: {str(e)}")
        raise


def extract_email_from_address(address: Optional[str]) -> Optional[str]:
    """
    Extract email address from a string that may contain name and email.
    Examples: "John Doe <john@example.com>" -> "john@example.com"
              "john@example.com" -> "john@example.com"
    """
    if not address:
        return None
    
    # Check if address contains <email>
    if "<" in address and ">" in address:
        start = address.find("<") + 1
        end = address.find(">")
        return address[start:end].strip()
    
    # Otherwise, return the address as-is (trimmed)
    return address.strip()


def extract_emails_from_json(json_data: Any) -> Set[str]:
    """Extract email addresses from JSONB array or string."""
    if not json_data:
        return set()
    
    emails = set()
    
    # If it's already a list
    if isinstance(json_data, list):
        for item in json_data:
            email = extract_email_from_address(item if isinstance(item, str) else str(item))
            if email:
                emails.add(email.lower())
    # If it's a string, try to parse as JSON
    elif isinstance(json_data, str):
        try:
            parsed = json.loads(json_data)
            if isinstance(parsed, list):
                for item in parsed:
                    email = extract_email_from_address(item if isinstance(item, str) else str(item))
                    if email:
                        emails.add(email.lower())
        except (json.JSONDecodeError, TypeError):
            # If parsing fails, treat as single email
            email = extract_email_from_address(json_data)
            if email:
                emails.add(email.lower())
    
    return emails


def extract_domain_from_email(email: str) -> str:
    """Extract domain from email address."""
    if "@" not in email:
        return ""
    return email.split("@")[1].lower()


def extract_local_part_from_email(email: str) -> str:
    """Extract local part (name part) from email address for use as full_name."""
    if "@" not in email:
        return email
    return email.split("@")[0].lower()


def resolve_thread_entities(user_id: str, thread_ids: List[str]) -> Dict[str, Any]:
    """
    Resolve thread entities by extracting emails, creating/finding customers,
    and linking them to threads via thread_participants.
    
    Args:
        user_id: UUID of the user
        thread_ids: List of thread_id strings to process
        
    Returns:
        Dictionary with processing results and statistics
    """
    supabase = get_supabase_client()
    
    result: Dict[str, Any] = {
        "success": True,
        "processed_threads": 0,
        "failed_threads": [],
        "customers_created": 0,
        "customers_found": 0,
        "participants_linked": 0,
        "jobs_triggered": 0,
        "skipped_threads": {},
        "errors": []
    }
    
    if not thread_ids:
        logger.warning("No thread_ids provided")
        return result
    
    try:
        # Step 1: State Update - Update thread_processing_stages to 'resolving_entities'
        logger.info(f"Updating {len(thread_ids)} threads to 'resolving_entities' stage")
        update_response = supabase.table("thread_processing_stages").update({
            "current_stage": "resolving_entities"
        }).in_("thread_id", thread_ids).eq("user_id", user_id).execute()
        
        if update_response.data is None:
            logger.warning("No threads updated in thread_processing_stages")
        
        # Step 2: Batch Fetch - Get thread_messages and user email
        logger.info("Fetching thread messages and user profile")
        
        # Fetch user's email from profiles (use maybe_single to handle missing profiles)
        user_email: Optional[str] = None
        try:
            profile_response = supabase.table("profiles").select("email").eq("id", user_id).maybe_single().execute()
            if profile_response and profile_response.data:
                user_email = profile_response.data.get("email", "").lower() if profile_response.data.get("email") else None
        except Exception as e:
            logger.warning(f"Could not fetch user profile for user_id: {user_id}: {e}")
        
        if not user_email:
            logger.warning(f"Could not find user email for user_id: {user_id} - will proceed without filtering user's own email")
        
        # Fetch all thread_messages for the given thread_ids
        messages_response = supabase.table("thread_messages").select(
            "message_id, thread_id, from_address, to_addresses, cc_addresses"
        ).in_("thread_id", thread_ids).eq("user_id", user_id).execute()
        
        if not messages_response.data:
            logger.warning("No messages found for the given thread_ids")
            # Update stages to 'analyzing' even if no messages
            supabase.table("thread_processing_stages").update({
                "current_stage": "analyzing"
            }).in_("thread_id", thread_ids).eq("user_id", user_id).execute()
            return result
        
        messages = messages_response.data
        logger.info(f"Found {len(messages)} messages across {len(thread_ids)} threads")
        
        # Step 3: Email Extraction - Extract unique emails per thread
        thread_emails: Dict[str, Set[str]] = {}  # thread_id -> set of emails
        
        for message in messages:
            thread_id = message.get("thread_id")
            if not thread_id:
                continue
            
            if thread_id not in thread_emails:
                thread_emails[thread_id] = set()
            
            # Extract from_address
            from_addr = message.get("from_address")
            if from_addr:
                email = extract_email_from_address(from_addr)
                if email:
                    thread_emails[thread_id].add(email.lower())
            
            # Extract to_addresses (JSONB)
            to_addresses = message.get("to_addresses")
            if to_addresses:
                emails = extract_emails_from_json(to_addresses)
                thread_emails[thread_id].update(emails)
            
            # Extract cc_addresses (JSONB)
            cc_addresses = message.get("cc_addresses")
            if cc_addresses:
                emails = extract_emails_from_json(cc_addresses)
                thread_emails[thread_id].update(emails)
        
        # Filter out user's own email
        if user_email:
            for thread_id in thread_emails:
                thread_emails[thread_id].discard(user_email)
        
        logger.info(f"Extracted emails for {len(thread_emails)} threads")
        
        # Step 4: Customer Resolution
        # Build a map of email -> customer_id for all unique emails
        email_to_customer_id: Dict[str, str] = {}
        all_unique_emails = set()
        for emails in thread_emails.values():
            all_unique_emails.update(emails)
        
        logger.info(f"Resolving {len(all_unique_emails)} unique email addresses to customers")
        
        for email in all_unique_emails:
            try:
                # Check if customer exists
                customer_response = supabase.table("customers").select("customer_id").eq(
                    "email", email
                ).eq("user_id", user_id).maybe_single().execute()
                
                if customer_response and customer_response.data:
                    # Existing customer
                    customer_id = customer_response.data.get("customer_id")
                    if customer_id:
                        email_to_customer_id[email] = customer_id
                        result["customers_found"] += 1
                        logger.debug(f"Found existing customer for {email}: {customer_id}")
                else:
                    # New customer - create it
                    domain = extract_domain_from_email(email)
                    local_part = extract_local_part_from_email(email)
                    
                    # Query companies table for matching domain
                    company_id: Optional[str] = None
                    if domain:
                        company_response = supabase.table("companies").select("company_id").eq(
                            "domain_name", domain
                        ).eq("user_id", user_id).maybe_single().execute()
                        
                        if company_response and company_response.data:
                            company_id = company_response.data.get("company_id")
                        else:
                            # Just-in-Time Company Creation: Create company if it doesn't exist
                            # Format company name from domain (e.g., "newstartup.com" -> "Newstartup")
                            company_name = domain.split(".")[0].capitalize() if "." in domain else domain.capitalize()
                            
                            # Insert new company
                            company_data = {
                                "user_id": user_id,
                                "domain_name": domain,
                                "company_name": company_name,
                                "status": "active"
                            }
                            
                            company_insert_response = supabase.table("companies").insert(company_data).execute()
                            
                            if company_insert_response and company_insert_response.data:
                                # Response.data is a list, get the first item
                                inserted_company = company_insert_response.data[0] if isinstance(company_insert_response.data, list) else company_insert_response.data
                                company_id = inserted_company.get("company_id")
                                if company_id:
                                    logger.info(f"Created new company for domain {domain}: {company_id} (company_name: {company_name})")
                                else:
                                    logger.error(f"Failed to get company_id after insert for domain {domain}")
                            else:
                                logger.error(f"Failed to create company for domain {domain}: {company_insert_response}")
                    
                    # Ensure we have a company_id before creating customer
                    if not company_id:
                        error_msg = f"Could not create or find company for domain {domain} - cannot create customer {email}"
                        logger.error(error_msg)
                        result["errors"].append(error_msg)
                        continue
                    
                    # Insert new customer with valid company_id
                    customer_data = {
                        "user_id": user_id,
                        "email": email,
                        "full_name": local_part,  # Use local part as placeholder
                        "company_id": company_id,
                        "domain_match": domain,
                        "status": "prospect"
                    }
                    
                    insert_response = supabase.table("customers").insert(customer_data).execute()
                    
                    # Supabase returns the inserted row(s) by default in response.data
                    if insert_response and insert_response.data:
                        # Response.data is a list, get the first item
                        inserted_row = insert_response.data[0] if isinstance(insert_response.data, list) else insert_response.data
                        customer_id = inserted_row.get("customer_id")
                        if customer_id:
                            email_to_customer_id[email] = customer_id
                            result["customers_created"] += 1
                            logger.info(f"Created new customer for {email}: {customer_id} (company_id: {company_id})")
                        else:
                            logger.error(f"Failed to get customer_id after insert for {email}")
                    else:
                        logger.error(f"Failed to create customer for {email}: {insert_response}")
                        
            except Exception as e:
                error_msg = f"Error resolving customer for {email}: {str(e)}"
                logger.error(error_msg)
                result["errors"].append(error_msg)
                continue
        
        # Step 5: Link Participants - Create thread_participants records
        logger.info("Linking participants to threads")
        participants_to_insert: List[Dict[str, Any]] = []
        
        for thread_id, emails in thread_emails.items():
            for email in emails:
                customer_id = email_to_customer_id.get(email)
                if not customer_id:
                    logger.warning(f"No customer_id found for email {email} in thread {thread_id}")
                    continue
                
                participants_to_insert.append({
                    "thread_id": thread_id,
                    "customer_id": customer_id,
                    "user_id": user_id
                })
        
        # Batch upsert thread_participants
        if participants_to_insert:
            try:
                # Use upsert with ignore_duplicates to handle existing participants
                # The unique constraint on (thread_id, customer_id) will prevent duplicates
                upsert_response = supabase.table("thread_participants").upsert(
                    participants_to_insert,
                    on_conflict="thread_id,customer_id",
                    ignore_duplicates=True
                ).execute()
                
                result["participants_linked"] = len(participants_to_insert)
                logger.info(f"Linked {len(participants_to_insert)} participants to threads")
                
            except Exception as e:
                # If upsert fails, try individual inserts with error handling
                error_msg = f"Error upserting thread_participants: {str(e)}"
                logger.warning(error_msg + " - attempting individual inserts")
                
                # Try individual inserts, ignoring duplicates
                successful_inserts = 0
                for participant in participants_to_insert:
                    try:
                        supabase.table("thread_participants").insert(participant).execute()
                        successful_inserts += 1
                    except Exception as individual_error:
                        # Ignore duplicate key errors
                        if "duplicate key" not in str(individual_error).lower():
                            logger.warning(f"Error inserting participant {participant}: {individual_error}")
                
                result["participants_linked"] = successful_inserts
                logger.info(f"Linked {successful_inserts} participants to threads (some may have been duplicates)")
        
        # Step 6: Idempotency Check - Filter threads that should be processed
        logger.info("Checking thread processing stages for idempotency")
        
        # Fetch current stages for all threads
        stages_response = supabase.table("thread_processing_stages").select(
            "thread_id, current_stage"
        ).in_("thread_id", thread_ids).eq("user_id", user_id).execute()
        
        # Build a map of thread_id -> current_stage
        thread_stages: Dict[str, Optional[str]] = {}
        if stages_response.data:
            for stage in stages_response.data:
                thread_stages[stage.get("thread_id")] = stage.get("current_stage")
        
        # Filter threads based on idempotency rules
        threads_to_process: List[str] = []
        skipped_threads: Dict[str, str] = {}  # thread_id -> reason
        
        for thread_id in thread_ids:
            current_stage = thread_stages.get(thread_id)
            
            # Condition A: Skip if already in flight
            if current_stage in ["analyzing", "queued", "queued_for_analysis"]:
                skipped_threads[thread_id] = f"already in '{current_stage}' stage"
                logger.info(f"⏭️  Skipping thread {thread_id}: already in '{current_stage}' stage")
                continue
            
            # Condition B: Skip if completed
            if current_stage == "completed":
                skipped_threads[thread_id] = "already completed"
                logger.info(f"⏭️  Skipping thread {thread_id}: already completed")
                continue
            
            # Condition C: Process if stage is 'new', 'pending', 'resolving_entities', or doesn't exist
            if current_stage in ["new", "pending", "resolving_entities", None]:
                threads_to_process.append(thread_id)
                logger.info(f"✅ Thread {thread_id} will be processed (current_stage: {current_stage or 'not found'})")
            else:
                # Unknown stage - log warning but process it
                logger.warning(f"⚠️  Thread {thread_id} has unknown stage '{current_stage}', will process anyway")
                threads_to_process.append(thread_id)
        
        # Log summary
        if skipped_threads:
            logger.info(f"⏭️  Skipped {len(skipped_threads)} thread(s) due to idempotency checks")
            result["skipped_threads"] = skipped_threads
        
        if not threads_to_process:
            logger.info("⏭️  All threads were skipped - no analysis jobs to trigger")
            result["processed_threads"] = len(thread_ids)
            result["jobs_triggered"] = 0
            return result
        
        # Step 7: Update to 'queued' stage and trigger analysis jobs (only for threads to process)
        logger.info(f"Updating {len(threads_to_process)} threads to 'queued' stage and triggering analysis jobs")
        try:
            # Update only threads that will be processed
            supabase.table("thread_processing_stages").update({
                "current_stage": "queued"
            }).in_("thread_id", threads_to_process).eq("user_id", user_id).execute()
            
            # Trigger analysis jobs for each thread to process
            triggered_count = 0
            for thread_id in threads_to_process:
                try:
                    trigger_analyze_thread_job(user_id, thread_id)
                    triggered_count += 1
                except Exception as job_error:
                    error_msg = f"Error triggering analysis job for thread {thread_id}: {str(job_error)}"
                    logger.warning(error_msg)
                    result["errors"].append(error_msg)
            
            result["processed_threads"] = len(thread_ids)
            result["jobs_triggered"] = triggered_count
            logger.info(f"Successfully processed {len(thread_ids)} threads, triggered {triggered_count} analysis jobs ({len(skipped_threads)} skipped)")
            
        except Exception as e:
            error_msg = f"Error updating final stage and triggering jobs: {str(e)}"
            logger.error(error_msg)
            result["errors"].append(error_msg)
            result["success"] = False
        
    except Exception as e:
        error_msg = f"Fatal error in resolve_thread_entities: {str(e)}"
        logger.error(error_msg, exc_info=True)
        result["success"] = False
        result["errors"].append(error_msg)
        
        # Try to update failed threads
        try:
            supabase.table("thread_processing_stages").update({
                "current_stage": "failed"
            }).in_("thread_id", thread_ids).eq("user_id", user_id).execute()
        except:
            pass
    
    return result

