"""
Thread Entity Processor Service

Processes threads to extract participants, create/link companies and customers,
and establish thread-company relationships. Handles the ETL process for threads
in the 'imported' stage.
"""

import json
import logging
import os
import sys
from typing import Any, Dict, List, Optional, Set

from supabase import create_client, Client

# Import helper functions from resolver.py to avoid code duplication
try:
    from backend.services.resolver import (
        extract_email_from_address,
        extract_emails_from_json,
        extract_domain_from_email,
    )
except ImportError:
    # Fallback: Define helpers locally if import fails
    def extract_email_from_address(address: Optional[str]) -> Optional[str]:
        """Extract email address from a string that may contain name and email."""
        if not address:
            return None
        if "<" in address and ">" in address:
            start = address.find("<") + 1
            end = address.find(">")
            return address[start:end].strip()
        return address.strip()

    def extract_emails_from_json(json_data: Any) -> Set[str]:
        """Extract email addresses from JSONB array or string."""
        if not json_data:
            return set()
        emails = set()
        if isinstance(json_data, list):
            for item in json_data:
                email = extract_email_from_address(item if isinstance(item, str) else str(item))
                if email:
                    emails.add(email.lower())
        elif isinstance(json_data, str):
            try:
                parsed = json.loads(json_data)
                if isinstance(parsed, list):
                    for item in parsed:
                        email = extract_email_from_address(item if isinstance(item, str) else str(item))
                        if email:
                            emails.add(email.lower())
            except (json.JSONDecodeError, TypeError):
                email = extract_email_from_address(json_data)
                if email:
                    emails.add(email.lower())
        return emails

    def extract_domain_from_email(email: str) -> str:
        """Extract domain from email address."""
        if "@" not in email:
            return ""
        return email.split("@")[1].lower()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Common email provider domains to filter out
COMMON_EMAIL_PROVIDERS = {
    "gmail.com",
    "yahoo.com",
    "outlook.com",
    "hotmail.com",
    "icloud.com",
}


def get_supabase_client() -> Client:
    """Initialize and return Supabase client using service role key."""
    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url:
        raise ValueError("SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL environment variable is required")
    if not supabase_key:
        raise ValueError("SUPABASE_SERVICE_ROLE_KEY environment variable is required")

    return create_client(supabase_url, supabase_key)


def is_business_domain(domain: str) -> bool:
    """Check if domain is a business domain (not a common email provider)."""
    if not domain:
        return False
    return domain.lower() not in COMMON_EMAIL_PROVIDERS


def process_thread_entities(user_id: str, thread_id: str) -> Dict[str, Any]:
    """
    Process thread entities: extract participants, create/link companies and customers.
    
    This function handles the ETL process for a thread:
    1. Fetches all messages for the thread
    2. Extracts participant email addresses
    3. Filters business domains (excludes common email providers)
    4. Upserts companies for unique business domains
    5. Upserts customers for each participant email
    6. Creates thread-company links
    7. Updates processing stage
    
    Args:
        user_id: UUID of the user
        thread_id: Thread ID to process
        
    Returns:
        Dictionary with processing results and statistics
    """
    supabase = get_supabase_client()

    result: Dict[str, Any] = {
        "success": False,
        "thread_id": thread_id,
        "user_id": user_id,
        "messages_processed": 0,
        "emails_extracted": 0,
        "business_domains_found": 0,
        "companies_created": 0,
        "companies_found": 0,
        "customers_created": 0,
        "customers_found": 0,
        "thread_company_links_created": 0,
        "errors": [],
    }

    try:
        # Step 1: Update state to 'resolving_entities'
        logger.info(f"Updating thread {thread_id} to 'resolving_entities' stage")
        try:
            update_response = supabase.table("thread_processing_stages").update({
                "current_stage": "resolving_entities"
            }).eq("thread_id", thread_id).eq("user_id", user_id).execute()

            if not update_response.data:
                logger.warning(f"No thread_processing_stages record found for thread {thread_id}")
        except Exception as e:
            error_msg = f"Error updating stage to 'resolving_entities': {str(e)}"
            logger.error(error_msg)
            result["errors"].append(error_msg)
            # Continue processing even if stage update fails

        # Step 2: Fetch all messages for this thread
        logger.info(f"Fetching messages for thread {thread_id}")
        try:
            messages_response = supabase.table("thread_messages").select(
                "message_id, from_address, to_addresses, cc_addresses"
            ).eq("thread_id", thread_id).eq("user_id", user_id).execute()

            if not messages_response.data:
                logger.warning(f"No messages found for thread {thread_id}")
                # Update stage to 'queued' even if no messages
                supabase.table("thread_processing_stages").update({
                    "current_stage": "queued"
                }).eq("thread_id", thread_id).eq("user_id", user_id).execute()
                result["success"] = True
                return result

            messages = messages_response.data
            result["messages_processed"] = len(messages)
            logger.info(f"Found {len(messages)} messages for thread {thread_id}")

        except Exception as e:
            error_msg = f"Error fetching messages: {str(e)}"
            logger.error(error_msg)
            result["errors"].append(error_msg)
            raise

        # Step 3: Extract participant email addresses
        logger.info("Extracting participant email addresses")
        participant_emails: Set[str] = set()

        for message in messages:
            # Extract from_address
            from_addr = message.get("from_address")
            if from_addr:
                email = extract_email_from_address(from_addr)
                if email:
                    participant_emails.add(email.lower())

            # Extract to_addresses (JSONB)
            to_addresses = message.get("to_addresses")
            if to_addresses:
                emails = extract_emails_from_json(to_addresses)
                participant_emails.update(emails)

            # Extract cc_addresses (JSONB)
            cc_addresses = message.get("cc_addresses")
            if cc_addresses:
                emails = extract_emails_from_json(cc_addresses)
                participant_emails.update(emails)

        result["emails_extracted"] = len(participant_emails)
        logger.info(f"Extracted {len(participant_emails)} unique email addresses")

        # Step 4: Filter business domains
        logger.info("Filtering business domains")
        business_domains: Set[str] = set()
        email_to_domain: Dict[str, str] = {}

        for email in participant_emails:
            domain = extract_domain_from_email(email)
            if domain and is_business_domain(domain):
                business_domains.add(domain)
                email_to_domain[email] = domain

        result["business_domains_found"] = len(business_domains)
        logger.info(f"Found {len(business_domains)} unique business domains")

        # Step 5: Upsert Companies
        logger.info("Upserting companies")
        domain_to_company_id: Dict[str, str] = {}

        for domain in business_domains:
            try:
                # Check if company exists
                company_response = supabase.table("companies").select("company_id").eq(
                    "domain_name", domain
                ).eq("user_id", user_id).maybe_single().execute()

                if company_response and company_response.data:
                    # Existing company
                    company_id = company_response.data.get("company_id")
                    if company_id:
                        domain_to_company_id[domain] = company_id
                        result["companies_found"] += 1
                        logger.debug(f"Found existing company for domain {domain}: {company_id}")
                else:
                    # New company - create it
                    # Format company name from domain (e.g., "example.com" -> "Example")
                    company_name = domain.split(".")[0].capitalize() if "." in domain else domain.capitalize()

                    company_data = {
                        "user_id": user_id,
                        "domain_name": domain,
                        "company_name": company_name,
                        "status": "active",
                    }

                    # Upsert with conflict on (user_id, domain_name)
                    try:
                        # Try upsert first
                        upsert_response = supabase.table("companies").upsert(
                            company_data,
                            on_conflict="user_id,domain_name",
                        ).execute()

                        if upsert_response and upsert_response.data:
                            inserted_company = upsert_response.data[0] if isinstance(upsert_response.data, list) else upsert_response.data
                            company_id = inserted_company.get("company_id")
                            if company_id:
                                domain_to_company_id[domain] = company_id
                                result["companies_created"] += 1
                                logger.info(f"Created/updated company for domain {domain}: {company_id}")
                            else:
                                logger.error(f"Failed to get company_id after upsert for domain {domain}")
                        else:
                            logger.error(f"Failed to upsert company for domain {domain}: {upsert_response}")

                    except Exception as upsert_error:
                        # Fallback to insert if upsert fails
                        logger.warning(f"Upsert failed for domain {domain}, trying insert: {str(upsert_error)}")
                        try:
                            insert_response = supabase.table("companies").insert(company_data).execute()
                            if insert_response and insert_response.data:
                                inserted_company = insert_response.data[0] if isinstance(insert_response.data, list) else insert_response.data
                                company_id = inserted_company.get("company_id")
                                if company_id:
                                    domain_to_company_id[domain] = company_id
                                    result["companies_created"] += 1
                                    logger.info(f"Created company for domain {domain}: {company_id}")
                        except Exception as insert_error:
                            # Ignore duplicate key errors
                            if "duplicate key" not in str(insert_error).lower() and "unique constraint" not in str(insert_error).lower():
                                error_msg = f"Error creating company for domain {domain}: {str(insert_error)}"
                                logger.error(error_msg)
                                result["errors"].append(error_msg)

            except Exception as e:
                error_msg = f"Error processing company for domain {domain}: {str(e)}"
                logger.error(error_msg)
                result["errors"].append(error_msg)
                continue

        # Step 6: Upsert Customers
        logger.info("Upserting customers")
        email_to_customer_id: Dict[str, str] = {}

        for email in participant_emails:
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

                        # Update company_id if domain matches a company
                        domain = email_to_domain.get(email)
                        if domain:
                            company_id = domain_to_company_id.get(domain)
                            if company_id:
                                try:
                                    supabase.table("customers").update({
                                        "company_id": company_id,
                                        "domain_match": domain,
                                    }).eq("customer_id", customer_id).eq("user_id", user_id).execute()
                                    logger.debug(f"Updated customer {customer_id} with company_id {company_id}")
                                except Exception as update_error:
                                    logger.warning(f"Error updating customer {customer_id} with company_id: {str(update_error)}")
                else:
                    # New customer - create it
                    domain = email_to_domain.get(email)
                    company_id = domain_to_company_id.get(domain) if domain else None

                    # Extract local part for full_name placeholder
                    local_part = email.split("@")[0] if "@" in email else email

                    customer_data = {
                        "user_id": user_id,
                        "email": email,
                        "full_name": local_part,  # Use local part as placeholder
                        "status": "prospect",
                    }

                    # Add company_id and domain_match if available
                    if company_id:
                        customer_data["company_id"] = company_id
                    if domain:
                        customer_data["domain_match"] = domain

                    # Upsert customer (handle duplicates gracefully)
                    try:
                        # Try to insert first
                        insert_response = supabase.table("customers").insert(customer_data).execute()

                        if insert_response and insert_response.data:
                            inserted_row = insert_response.data[0] if isinstance(insert_response.data, list) else insert_response.data
                            customer_id = inserted_row.get("customer_id")
                            if customer_id:
                                email_to_customer_id[email] = customer_id
                                result["customers_created"] += 1
                                logger.info(f"Created customer for {email}: {customer_id}")
                            else:
                                logger.error(f"Failed to get customer_id after insert for {email}")
                        else:
                            logger.error(f"Failed to create customer for {email}: {insert_response}")

                    except Exception as insert_error:
                        # If insert fails due to duplicate, try to fetch existing
                        if "duplicate key" in str(insert_error).lower() or "unique constraint" in str(insert_error).lower():
                            logger.debug(f"Customer {email} already exists, fetching existing record")
                            try:
                                existing_response = supabase.table("customers").select("customer_id").eq(
                                    "email", email
                                ).eq("user_id", user_id).maybe_single().execute()
                                if existing_response and existing_response.data:
                                    customer_id = existing_response.data.get("customer_id")
                                    if customer_id:
                                        email_to_customer_id[email] = customer_id
                                        result["customers_found"] += 1
                                        # Try to update company_id if available
                                        if company_id:
                                            try:
                                                supabase.table("customers").update({
                                                    "company_id": company_id,
                                                    "domain_match": domain,
                                                }).eq("customer_id", customer_id).eq("user_id", user_id).execute()
                                            except Exception:
                                                pass
                            except Exception as fetch_error:
                                error_msg = f"Error fetching existing customer for {email}: {str(fetch_error)}"
                                logger.warning(error_msg)
                                result["errors"].append(error_msg)
                        else:
                            error_msg = f"Error creating customer for {email}: {str(insert_error)}"
                            logger.error(error_msg)
                            result["errors"].append(error_msg)

            except Exception as e:
                error_msg = f"Error processing customer for {email}: {str(e)}"
                logger.error(error_msg)
                result["errors"].append(error_msg)
                continue

        # Step 7: Create Thread-Company Links
        logger.info("Creating thread-company links")
        companies_for_thread = set(domain_to_company_id.values())

        for company_id in companies_for_thread:
            try:
                link_data = {
                    "thread_id": thread_id,
                    "company_id": company_id,
                    "user_id": user_id,
                }

                # Insert with conflict handling (unique constraint on thread_id, company_id)
                try:
                    insert_response = supabase.table("thread_company_link").insert(link_data).execute()
                    if insert_response and insert_response.data:
                        result["thread_company_links_created"] += 1
                        logger.debug(f"Created thread-company link for thread {thread_id} and company {company_id}")
                except Exception as insert_error:
                    # Ignore duplicate key errors (link already exists)
                    if "duplicate key" not in str(insert_error).lower() and "unique constraint" not in str(insert_error).lower():
                        error_msg = f"Error creating thread-company link: {str(insert_error)}"
                        logger.warning(error_msg)
                        result["errors"].append(error_msg)

            except Exception as e:
                error_msg = f"Error creating thread-company link for company {company_id}: {str(e)}"
                logger.warning(error_msg)
                result["errors"].append(error_msg)
                continue

        # Step 8: Update state to 'queued' (success)
        logger.info(f"Updating thread {thread_id} to 'queued' stage")
        try:
            supabase.table("thread_processing_stages").update({
                "current_stage": "queued"
            }).eq("thread_id", thread_id).eq("user_id", user_id).execute()
            logger.info(f"Successfully updated thread {thread_id} to 'queued' stage")
        except Exception as e:
            error_msg = f"Error updating stage to 'queued': {str(e)}"
            logger.error(error_msg)
            result["errors"].append(error_msg)
            # Don't fail the entire operation if stage update fails

        result["success"] = True
        logger.info(f"Successfully processed thread {thread_id}")

    except Exception as e:
        error_msg = f"Fatal error in process_thread_entities: {str(e)}"
        logger.error(error_msg, exc_info=True)
        result["success"] = False
        result["errors"].append(error_msg)

        # Try to update failed stage
        try:
            supabase.table("thread_processing_stages").update({
                "current_stage": "failed"
            }).eq("thread_id", thread_id).eq("user_id", user_id).execute()
        except Exception:
            pass

    return result


if __name__ == "__main__":
    """Entry point for command-line execution via Trigger.dev."""
    if len(sys.argv) != 3:
        print("Error: Missing required arguments", file=sys.stderr)
        print("Usage: python processor.py <user_id> <thread_id>", file=sys.stderr)
        sys.exit(1)
    
    user_id = sys.argv[1]
    thread_id = sys.argv[2]
    
    try:
        result = process_thread_entities(user_id, thread_id)
        # Print result as JSON to stdout for Trigger.dev to capture
        print(json.dumps(result, indent=2))
    except Exception as e:
        error_msg = f"Error processing thread entities: {str(e)}"
        logger.error(error_msg, exc_info=True)
        print(json.dumps({
            "success": False,
            "thread_id": thread_id,
            "user_id": user_id,
            "errors": [error_msg]
        }), file=sys.stderr)
        sys.exit(1)

