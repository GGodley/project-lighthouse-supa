"""
Thread Analyzer Service

Analyzes email threads using GPT-4o to extract structured summaries,
next steps, and feature requests. Stores results using flat schema.
"""

import json
import logging
import os
import sys
from datetime import datetime
from typing import Any, Dict, List, Optional

import google.generativeai as genai
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


def get_gemini_client():
    """Initialize and return Gemini client."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY environment variable is required")
    genai.configure(api_key=api_key)
    return genai


def estimate_tokens(text: str) -> int:
    """Estimate token count (approximately 4 characters = 1 token)."""
    return len(text) // 4


def truncate_messages_smart(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Smart truncation: If total tokens > 100,000, keep first 20% and last 20%,
    replace middle 60% with truncation message.
    """
    if not messages:
        return messages
    
    # Calculate total tokens
    total_text = " ".join([msg.get("text", "") for msg in messages])
    total_tokens = estimate_tokens(total_text)
    
    if total_tokens <= 100000:
        return messages
    
    logger.info(f"Thread exceeds 100k tokens ({total_tokens}), applying smart truncation")
    
    total_messages = len(messages)
    first_20_percent = int(total_messages * 0.2)
    last_20_percent = int(total_messages * 0.2)
    
    # Keep first 20% and last 20%
    truncated = messages[:first_20_percent]
    truncated.append({
        "text": "[...Middle of conversation truncated for length...]",
        "sender": "System",
        "timestamp": None
    })
    truncated.extend(messages[-last_20_percent:])
    
    return truncated


def construct_transcript(
    messages: List[Dict[str, Any]],
    participants: Dict[str, Dict[str, str]]
) -> str:
    """
    Construct a formatted transcript from messages.
    Format: "CustomerName (CompanyName): message_text"
    """
    transcript_lines = []
    
    for message in messages:
        from_address = message.get("from_address", "")
        body_text = message.get("body_text", "") or message.get("body_html", "")
        
        if not body_text:
            continue
        
        # Get participant info
        customer_id = message.get("customer_id")
        participant_info = participants.get(customer_id, {}) if customer_id else {}
        
        customer_name = participant_info.get("customer_name", "Unknown")
        company_name = participant_info.get("company_name", "Unknown Company")
        
        # Format: "CustomerName (CompanyName): message_text"
        transcript_lines.append(f"{customer_name} ({company_name}): {body_text}")
    
    return "\n\n".join(transcript_lines)


def parse_due_date(date_str: Optional[str]) -> Optional[str]:
    """
    Parse due_date from YYYY-MM-DD format to ISO timestamp.
    Returns None if invalid or not provided.
    """
    if not date_str:
        return None
    
    try:
        # Parse YYYY-MM-DD format
        date_obj = datetime.strptime(date_str.strip(), "%Y-%m-%d")
        # Return as ISO format string
        return date_obj.isoformat()
    except (ValueError, AttributeError):
        logger.warning(f"Invalid due_date format: {date_str}, skipping")
        return None


def check_next_step_exists(supabase: Client, thread_id: str, description: str) -> bool:
    """
    Check if a next_step with the same description (case-insensitive) already exists for this thread.
    
    Args:
        supabase: Supabase client
        thread_id: Thread ID to check
        description: Description text to check for duplicates
        
    Returns:
        True if a duplicate exists, False otherwise
    """
    if not description:
        return False
    
    try:
        # Query all next_steps for this thread
        response = supabase.table("next_steps").select("description").eq(
            "thread_id", thread_id
        ).execute()
        
        if not response.data:
            return False
        
        # Check case-insensitive match
        description_lower = description.lower().strip()
        for step in response.data:
            existing_description = step.get("description", "")
            if existing_description and existing_description.lower().strip() == description_lower:
                return True
        
        return False
    except Exception as e:
        logger.warning(f"Error checking for duplicate next_step: {e}")
        # On error, assume it doesn't exist to avoid blocking inserts
        return False


def check_feature_request_exists(supabase: Client, thread_id: str, title: str) -> bool:
    """
    Check if a feature_request with the same title (case-insensitive) already exists for this thread.
    
    Args:
        supabase: Supabase client
        thread_id: Thread ID to check
        title: Title text to check for duplicates
        
    Returns:
        True if a duplicate exists, False otherwise
    """
    if not title:
        return False
    
    try:
        # Query all feature_requests for this thread
        response = supabase.table("feature_requests").select("title").eq(
            "thread_id", thread_id
        ).execute()
        
        if not response.data:
            return False
        
        # Check case-insensitive match
        title_lower = title.lower().strip()
        for fr in response.data:
            existing_title = fr.get("title", "")
            if existing_title and existing_title.lower().strip() == title_lower:
                return True
        
        return False
    except Exception as e:
        logger.warning(f"Error checking for duplicate feature_request: {e}")
        # On error, assume it doesn't exist to avoid blocking inserts
        return False


def analyze_thread(user_id: str, thread_id: str) -> Dict[str, Any]:
    """
    Analyze a thread using GPT-4o and save results to database.
    
    Args:
        user_id: UUID of the user
        thread_id: Thread ID to analyze
        
    Returns:
        Dictionary with analysis results and status
    """
    supabase = get_supabase_client()
    genai_client = get_gemini_client()
    
    result: Dict[str, Any] = {
        "success": False,
        "thread_id": thread_id,
        "errors": []
    }
    
    try:
        # Step 1: Fetch Data
        logger.info(f"Fetching data for thread {thread_id}")
        
        # Fetch thread metadata including last_analyzed_at and summary for mode selection
        thread_response = supabase.table("threads").select(
            "thread_id, subject, snippet, last_message_date, last_analyzed_at, summary"
        ).eq("thread_id", thread_id).eq("user_id", user_id).maybe_single().execute()
        
        if not thread_response or not thread_response.data:
            raise ValueError(f"Thread {thread_id} not found for user {user_id}")
        
        thread_data = thread_response.data
        last_analyzed_at = thread_data.get("last_analyzed_at")
        old_summary = thread_data.get("summary")
        
        # Fetch messages ordered by sent_date
        messages_response = supabase.table("thread_messages").select(
            "message_id, thread_id, from_address, body_text, body_html, sent_date, customer_id"
        ).eq("thread_id", thread_id).eq("user_id", user_id).order("sent_date", desc=False).execute()
        
        if not messages_response.data:
            raise ValueError(f"No messages found for thread {thread_id}")
        
        messages = messages_response.data
        logger.info(f"Found {len(messages)} messages")
        
        # Step 1.5: Mode Selection and Message Filtering
        analysis_mode = "full" if last_analyzed_at is None else "incremental"
        logger.info(f"Analysis mode: {analysis_mode}")
        
        if analysis_mode == "incremental":
            # Filter messages sent after last_analyzed_at
            # Use sent_date if available, otherwise fall back to created_at
            filtered_messages = []
            for msg in messages:
                msg_date = msg.get("sent_date") or msg.get("created_at")
                if msg_date:
                    # Compare timestamps (last_analyzed_at is ISO string, msg_date might be ISO or datetime)
                    try:
                        if isinstance(msg_date, str):
                            msg_datetime = datetime.fromisoformat(msg_date.replace("Z", "+00:00"))
                        else:
                            msg_datetime = msg_date
                        
                        if isinstance(last_analyzed_at, str):
                            last_analyzed_datetime = datetime.fromisoformat(last_analyzed_at.replace("Z", "+00:00"))
                        else:
                            last_analyzed_datetime = last_analyzed_at
                        
                        if msg_datetime > last_analyzed_datetime:
                            filtered_messages.append(msg)
                    except Exception as e:
                        logger.warning(f"Error comparing dates for message {msg.get('message_id')}: {e}, including message")
                        filtered_messages.append(msg)
                else:
                    # If no date, include the message to be safe
                    logger.warning(f"Message {msg.get('message_id')} has no date, including it")
                    filtered_messages.append(msg)
            
            if not filtered_messages:
                logger.info("No new messages since last analysis - skipping analysis")
                # Update thread_processing_stages to completed
                supabase.table("thread_processing_stages").update({
                    "current_stage": "completed"
                }).eq("thread_id", thread_id).eq("user_id", user_id).execute()
                
                result["success"] = True
                result["analysis"] = {
                    "mode": "incremental",
                    "skipped": True,
                    "reason": "No new messages"
                }
                return result
            
            messages = filtered_messages
            logger.info(f"Filtered to {len(messages)} new messages for incremental analysis")
        
        # Fetch participants with customer and company info
        # First, get thread_participants
        participants_response = supabase.table("thread_participants").select(
            "customer_id"
        ).eq("thread_id", thread_id).execute()
        
        # Build participants map by fetching customer and company data
        participants: Dict[str, Dict[str, str]] = {}
        customer_ids = [p.get("customer_id") for p in (participants_response.data or []) if p.get("customer_id")]
        
        if customer_ids:
            # Fetch customers with their companies
            customers_response = supabase.table("customers").select(
                "customer_id, full_name, email, company_id, companies(company_id, company_name)"
            ).in_("customer_id", customer_ids).eq("user_id", user_id).execute()
            
            for customer in customers_response.data or []:
                customer_id = customer.get("customer_id")
                if not customer_id:
                    continue
                
                # Extract company name
                company_data = customer.get("companies")
                company_name = "Unknown Company"
                if isinstance(company_data, dict):
                    company_name = company_data.get("company_name", "Unknown Company")
                elif isinstance(company_data, list) and len(company_data) > 0:
                    company_name = company_data[0].get("company_name", "Unknown Company")
                
                # Extract customer name
                customer_name = customer.get("full_name")
                if not customer_name:
                    email = customer.get("email", "")
                    customer_name = email.split("@")[0] if email else "Unknown"
                
                participants[customer_id] = {
                    "customer_name": customer_name,
                    "company_name": company_name
                }
        
        # Step 2: Construct Transcript
        logger.info("Constructing transcript")
        transcript = construct_transcript(messages, participants)
        
        # Step 3: Smart Truncation
        # Check if truncation is needed before constructing full transcript
        total_text = " ".join([msg.get("body_text", "") or msg.get("body_html", "") for msg in messages])
        total_tokens = estimate_tokens(total_text)
        
        if total_tokens > 100000:
            logger.info(f"Thread exceeds 100k tokens ({total_tokens}), applying smart truncation")
            total_messages = len(messages)
            first_20_percent = int(total_messages * 0.2)
            last_20_percent = int(total_messages * 0.2)
            
            # Keep first 20% and last 20% of messages
            messages_to_use = messages[:first_20_percent] + messages[-last_20_percent:]
            
            # Reconstruct transcript with truncation message
            transcript_lines = []
            for msg in messages[:first_20_percent]:
                customer_id = msg.get("customer_id")
                participant_info = participants.get(customer_id, {}) if customer_id else {}
                customer_name = participant_info.get("customer_name", "Unknown")
                company_name = participant_info.get("company_name", "Unknown Company")
                body_text = msg.get("body_text", "") or msg.get("body_html", "")
                if body_text:
                    transcript_lines.append(f"{customer_name} ({company_name}): {body_text}")
            
            # Add truncation message
            transcript_lines.append("[...Middle of conversation truncated for length...]")
            
            # Add last 20% of messages
            for msg in messages[-last_20_percent:]:
                customer_id = msg.get("customer_id")
                participant_info = participants.get(customer_id, {}) if customer_id else {}
                customer_name = participant_info.get("customer_name", "Unknown")
                company_name = participant_info.get("company_name", "Unknown Company")
                body_text = msg.get("body_text", "") or msg.get("body_html", "")
                if body_text:
                    transcript_lines.append(f"{customer_name} ({company_name}): {body_text}")
            
            transcript = "\n\n".join(transcript_lines)
        
        # Step 4: Call LLM
        logger.info(f"Calling Gemini 3 Flash in {analysis_mode} mode")
        
        # Create system prompt based on mode
        if analysis_mode == "incremental":
            # Incremental mode: merge old summary with new messages
            system_prompt = f"""You are a CSM Analyst updating an existing thread.

Context: Here is the summary of the conversation so far: '{old_summary or "No previous summary"}'.

New Data: Here are the new messages: '{transcript}'.

Goal 1: Return a rewritten summary that merges the old context with the new updates. The summary should be comprehensive and reflect the entire conversation history.

Goal 2: Extract ONLY NEW next steps or feature requests found in the New Data. Do not restate items from the past. If an item was already mentioned in previous messages, do not include it.

Return a JSON object with the following structure:
{{
  "problem_statement": "A clear statement of the problem or topic discussed (updated with new context)",
  "key_participants": ["array", "of", "participant", "names"],
  "timeline_summary": "A summary of the timeline of events in the thread (merged old + new)",
  "resolution_status": "Status of resolution (e.g., 'Resolved', 'In Progress', 'Pending', 'Unresolved')",
  "customer_sentiment": "Customer sentiment (e.g., 'Very Positive', 'Positive', 'Neutral', 'Negative', 'Very Negative')",
  "sentiment_score": The numeric score that corresponds to the chosen sentiment (-2 for very negative, -1 for negative, 0 for neutral, 1 for positive, 2 for very positive),
  "next_steps": [
    {{
      "text": "Action item description (ONLY if it's NEW, not mentioned before)",
      "owner": "Name or email of person responsible (or null if not mentioned)",
      "due_date": "YYYY-MM-DD or null if not mentioned"
    }}
  ],
  "feature_requests": [
    {{
      "title": "A brief name that represents the feature conceptually (ONLY if it's NEW)",
      "customer_description": "A 1–2 sentence summary of what the customer is asking for",
      "use_case": "Why the customer wants it; what problem they are trying to solve",
      "urgency": "A string chosen from the Urgency levels ('Low', 'Medium', 'High')",
      "urgency_signals": "Quote or paraphrase the phrasing that indicates priority",
      "customer_impact": "Who is affected and how (1 sentence)"
    }}
  ]
}}

CRITICAL INSTRUCTIONS FOR NEXT STEPS:
• Only extract next steps that are EXPLICITLY mentioned in the NEW messages
• Do NOT create or infer next steps if they are not clearly stated
• If no NEW next steps are mentioned, return an empty array []
• Do not restate next steps that were already in the previous summary

CRITICAL INSTRUCTIONS FOR FEATURE REQUESTS:
• Only extract feature requests that are NEW in the new messages
• Do not restate feature requests that were already mentioned before
• If no NEW feature requests exist, return an empty array []

Sentiment Categories & Scores:
• "Very Positive" (Score: 2): Enthusiastic, explicit praise, clear plans for expansion
• "Positive" (Score: 1): Satisfied, complimentary, minor issues resolved, optimistic
• "Neutral" (Score: 0): No strong feelings, factual, informational, no complaints but no praise
• "Negative" (Score: -1): Frustrated, confused, mentioned blockers, unhappy with a feature or price
• "Very Negative" (Score: -2): Explicitly angry, threatening to churn, multiple major issues

The "customer" is any participant who is NOT the "CSM"."""
        else:
            # Full scan mode: standard analysis
            system_prompt = """You are a world-class Customer Success Manager (CSM) analyst. Analyze email threads and extract structured summaries.

Return a JSON object with the following structure:
{
  "problem_statement": "A clear statement of the problem or topic discussed",
  "key_participants": ["array", "of", "participant", "names"],
  "timeline_summary": "A summary of the timeline of events in the thread",
  "resolution_status": "Status of resolution (e.g., 'Resolved', 'In Progress', 'Pending', 'Unresolved')",
  "customer_sentiment": "Customer sentiment (e.g., 'Very Positive', 'Positive', 'Neutral', 'Negative', 'Very Negative')",
  "sentiment_score": The numeric score that corresponds to the chosen sentiment (-2 for very negative, -1 for negative, 0 for neutral, 1 for positive, 2 for very positive),
  "next_steps": [
    {
      "text": "Action item description",
      "owner": "Name or email of person responsible (or null if not mentioned)",
      "due_date": "YYYY-MM-DD or null if not mentioned"
    }
  ],
  "feature_requests": [
    {
      "title": "A brief name that represents the feature conceptually (e.g., 'Bulk User Editing', 'API Export for Reports')",
      "customer_description": "A 1–2 sentence summary of what the customer is asking for, in your own words. Keep it specific enough to understand the context, but generic enough to compare across customers.",
      "use_case": "Why the customer wants it; what problem they are trying to solve",
      "urgency": "A string chosen from the Urgency levels ('Low', 'Medium', 'High')",
      "urgency_signals": "Quote or paraphrase the phrasing that indicates priority (e.g. 'we need this before Q1 launch,' 'this is causing delays,' 'not urgent but useful')",
      "customer_impact": "Who is affected and how (1 sentence)"
    }
  ]
}

Feature Request Detection & Extraction:

1. Detect Feature Requests

Identify any sentence or paragraph where the customer is:
• Requesting a new feature
• Suggesting an improvement
• Reporting a limitation that implies a feature is missing
• Asking for a capability that doesn't exist yet

If no feature requests exist, return an empty array [].

2. Extract & Summarize Each Feature Request

For every feature request found:
• Title (generic, short): A brief name that represents the feature conceptually (e.g., "Bulk User Editing", "API Export for Reports").
• Customer Description (raw meaning): A 1–2 sentence summary of what the customer is asking for, in your own words. Keep it specific enough to understand the context, but generic enough to compare across customers.
• Use Case / Problem: Why the customer wants it; what problem they are trying to solve.
• Urgency Level: Categorize as:
  * High – Blocking workflows, time-sensitive, critical pain.
  * Medium – Important but not blocking.
  * Low – Nice-to-have or long-term improvement.
• Signals that justify the urgency rating: Quote or paraphrase the phrasing that indicates priority (e.g. "we need this before Q1 launch," "this is causing delays," "not urgent but useful").
• Customer Impact: Who is affected and how (1 sentence).

3. Additional Rules
• Make all titles and descriptions general enough that similar requests across customers can be grouped later.
• Be consistent in naming patterns so clustering will work well.

CRITICAL INSTRUCTIONS FOR NEXT STEPS:
• Only extract next steps that are EXPLICITLY mentioned in the conversation
• Do NOT create or infer next steps if they are not clearly stated
• If no next steps are mentioned, return an empty array []
• For owner: Extract the name or email of the person responsible. If not mentioned, use null
• For due_date: Extract the date in YYYY-MM-DD format if mentioned. If not mentioned, use null
• Do not hallucinate or make up next steps

Sentiment Categories & Scores:
• "Very Positive" (Score: 2): Enthusiastic, explicit praise, clear plans for expansion
• "Positive" (Score: 1): Satisfied, complimentary, minor issues resolved, optimistic
• "Neutral" (Score: 0): No strong feelings, factual, informational, no complaints but no praise
• "Negative" (Score: -1): Frustrated, confused, mentioned blockers, unhappy with a feature or price
• "Very Negative" (Score: -2): Explicitly angry, threatening to churn, multiple major issues

The "customer" is any participant who is NOT the "CSM"."""

        user_query = f"Email Thread:\n\n{transcript}\n\n"
        
        # Combine system and user prompts since Gemini doesn't use role-based messages
        full_prompt = f"{system_prompt}\n\n{user_query}"
        
        model = genai.GenerativeModel(
            "gemini-3-flash-preview",
            generation_config={
                "response_mime_type": "application/json",
                "temperature": 0.3
            }
        )
        
        response = model.generate_content(full_prompt)
        response_content = response.text
        if not response_content:
            raise ValueError("Empty response from Gemini")
        
        analysis = json.loads(response_content)
        logger.info("Successfully received analysis from Gemini")
        
        # Step 5: Save Results (Flat Schema - Split & Store)
        logger.info("Saving results to database")
        
        # Get timestamp for last_analyzed_at (used in both update and result)
        last_analyzed_timestamp = datetime.now().isoformat()
        
        # Update threads table (flat columns)
        threads_update = {}
        
        # summary: From timeline_summary or combination of problem_statement + timeline_summary
        timeline_summary = analysis.get("timeline_summary", "")
        problem_statement = analysis.get("problem_statement", "")
        if timeline_summary:
            threads_update["summary"] = timeline_summary
        elif problem_statement:
            threads_update["summary"] = problem_statement
        else:
            threads_update["summary"] = f"{problem_statement}\n\n{timeline_summary}".strip() if problem_statement and timeline_summary else None
        
        threads_update["sentiment"] = analysis.get("customer_sentiment")
        threads_update["sentiment_score"] = analysis.get("sentiment_score")
        threads_update["resolution_status"] = analysis.get("resolution_status")
        threads_update["problem_statement"] = problem_statement
        threads_update["timeline_summary"] = timeline_summary
        
        # Add last_analyzed_at timestamp (always update this)
        threads_update["last_analyzed_at"] = last_analyzed_timestamp
        
        # Remove None values (but always keep last_analyzed_at)
        threads_update_clean = {k: v for k, v in threads_update.items() if v is not None}
        # Ensure last_analyzed_at is always included
        if "last_analyzed_at" not in threads_update_clean:
            threads_update_clean["last_analyzed_at"] = last_analyzed_timestamp
        
        if threads_update_clean:
            supabase.table("threads").update(threads_update_clean).eq("thread_id", thread_id).eq("user_id", user_id).execute()
            logger.info("Updated threads table (including last_analyzed_at)")
        
        # Insert next_steps (flat columns only) with deduplication
        next_steps_data = analysis.get("next_steps", [])
        if next_steps_data:
            next_steps_to_insert = []
            skipped_count = 0
            for step in next_steps_data:
                description = step.get("text")
                if not description:
                    continue
                
                # Check for duplicate (case-insensitive)
                if check_next_step_exists(supabase, thread_id, description):
                    logger.info(f"⏭️  Skipping duplicate next_step: {description[:50]}...")
                    skipped_count += 1
                    continue
                
                step_data = {
                    "thread_id": thread_id,
                    "user_id": user_id,
                    "description": description,  # Map 'text' from JSON to 'description' column
                    "owner": step.get("owner") if step.get("owner") else None,
                    "due_date": parse_due_date(step.get("due_date")),
                    "status": "pending"
                }
                # Remove None values for optional fields that should be explicitly null
                if step_data["owner"] is None:
                    step_data["owner"] = None  # Keep as None
                if step_data["due_date"] is None:
                    step_data["due_date"] = None  # Keep as None
                next_steps_to_insert.append(step_data)
            
            if next_steps_to_insert:
                insert_response = supabase.table("next_steps").insert(next_steps_to_insert).execute()
                logger.info(f"Inserted {len(next_steps_to_insert)} next_steps ({skipped_count} skipped as duplicates)")
                
                # Create assignments for each inserted next step
                if insert_response and insert_response.data:
                    inserted_steps = insert_response.data if isinstance(insert_response.data, list) else [insert_response.data]
                    
                    # Get all customers from thread_participants for this thread
                    participants_response = supabase.table("thread_participants").select("customer_id").eq("thread_id", thread_id).eq("user_id", user_id).execute()
                    
                    customer_ids = []
                    if participants_response and participants_response.data:
                        # Get distinct customer_ids
                        customer_ids = list(set([p.get("customer_id") for p in participants_response.data if p.get("customer_id")]))
                    
                    # Create assignments for each next step and customer combination
                    if customer_ids:
                        assignments = []
                        for step in inserted_steps:
                            step_id = step.get("step_id") or step.get("id")  # Handle both column names
                            if step_id:
                                for customer_id in customer_ids:
                                    assignments.append({
                                        "next_step_id": step_id,
                                        "customer_id": customer_id
                                    })
                        
                        if assignments:
                            try:
                                supabase.table("next_step_assignments").insert(assignments).execute()
                                logger.info(f"Created {len(assignments)} next step assignments for thread {thread_id}")
                            except Exception as assignment_error:
                                logger.warning(f"Error creating next step assignments: {assignment_error}")
                                # Don't fail the entire process if assignments fail
            elif skipped_count > 0:
                logger.info(f"All {skipped_count} next_steps were duplicates - nothing to insert")
        
        # Insert feature_requests (flat columns only) with deduplication
        feature_requests_data = analysis.get("feature_requests", [])
        if feature_requests_data:
            feature_requests_to_insert = []
            skipped_count = 0
            for fr in feature_requests_data:
                title = fr.get("title")
                if not title:
                    continue
                
                # Check for duplicate (case-insensitive)
                if check_feature_request_exists(supabase, thread_id, title):
                    logger.info(f"⏭️  Skipping duplicate feature_request: {title}")
                    skipped_count += 1
                    continue
                
                fr_data = {
                    "thread_id": thread_id,
                    "user_id": user_id,
                    "title": title,
                    "customer_description": fr.get("customer_description"),
                    "use_case": fr.get("use_case"),
                    "urgency": fr.get("urgency"),  # 'Low', 'Medium', 'High'
                    "urgency_signals": fr.get("urgency_signals"),
                    "customer_impact": fr.get("customer_impact"),
                    "status": "new"
                }
                # Validate urgency
                if fr_data["urgency"] not in ["Low", "Medium", "High"]:
                    logger.warning(f"Invalid urgency '{fr_data['urgency']}', defaulting to 'Low'")
                    fr_data["urgency"] = "Low"
                
                feature_requests_to_insert.append(fr_data)
            
            if feature_requests_to_insert:
                supabase.table("feature_requests").insert(feature_requests_to_insert).execute()
                logger.info(f"Inserted {len(feature_requests_to_insert)} feature_requests ({skipped_count} skipped as duplicates)")
            elif skipped_count > 0:
                logger.info(f"All {skipped_count} feature_requests were duplicates - nothing to insert")
        
        # Update thread_processing_stages to completed
        supabase.table("thread_processing_stages").update({
            "current_stage": "completed"
        }).eq("thread_id", thread_id).eq("user_id", user_id).execute()
        
        # Update company health scores for all companies linked to this thread
        try:
            # Get all company_ids linked to this thread via thread_company_link
            link_response = supabase.table("thread_company_link").select(
                "company_id"
            ).eq("thread_id", thread_id).execute()
            
            if link_response.data:
                company_ids = [link["company_id"] for link in link_response.data]
                logger.info(f"Updating health scores for {len(company_ids)} companies linked to thread {thread_id}")
                
                for company_id in company_ids:
                    try:
                        # Call the RPC function to recalculate health score
                        supabase.rpc(
                            "recalculate_company_health_score",
                            {"target_company_id": company_id}
                        ).execute()
                        logger.info(f"✅ Updated health score for company: {company_id}")
                    except Exception as e:
                        logger.warning(
                            f"⚠️  Failed to update health score for company {company_id}: {str(e)}"
                        )
                        # Don't fail the analysis - health score update is non-critical
            else:
                logger.info(f"ℹ️  No companies linked to thread {thread_id}, skipping health score update")
        except Exception as e:
            logger.warning(
                f"⚠️  Error updating company health scores for thread {thread_id}: {str(e)}"
            )
            # Don't fail the analysis - health score update is non-critical
        
        result["success"] = True
        result["analysis"] = {
            "mode": analysis_mode,
            "problem_statement": problem_statement,
            "timeline_summary": timeline_summary,
            "sentiment": analysis.get("customer_sentiment"),
            "sentiment_score": analysis.get("sentiment_score"),
            "resolution_status": analysis.get("resolution_status"),
            "next_steps_count": len(next_steps_data),
            "feature_requests_count": len(feature_requests_data),
            "last_analyzed_at": last_analyzed_timestamp
        }
        
        logger.info(f"Successfully analyzed thread {thread_id}")
        
    except Exception as e:
        error_msg = f"Error analyzing thread {thread_id}: {str(e)}"
        logger.error(error_msg, exc_info=True)
        result["errors"].append(error_msg)
        result["success"] = False
        
        # Update thread_processing_stages to failed
        try:
            supabase.table("thread_processing_stages").update({
                "current_stage": "failed"
            }).eq("thread_id", thread_id).eq("user_id", user_id).execute()
        except:
            pass
    
    return result


if __name__ == "__main__":
    """Entry point for command-line execution via Trigger.dev."""
    if len(sys.argv) != 3:
        print("Error: Missing required arguments", file=sys.stderr)
        print("Usage: python analyzer.py <user_id> <thread_id>", file=sys.stderr)
        sys.exit(1)
    
    user_id = sys.argv[1]
    thread_id = sys.argv[2]
    
    try:
        result = analyze_thread(user_id, thread_id)
        # Print result as JSON to stdout for Trigger.dev to capture
        print(json.dumps(result, indent=2))
    except Exception as e:
        error_msg = f"Error analyzing thread: {str(e)}"
        logger.error(error_msg, exc_info=True)
        print(json.dumps({
            "success": False,
            "thread_id": thread_id,
            "errors": [error_msg]
        }), file=sys.stderr)
        sys.exit(1)

