"""
Trigger.dev Job: Analyze Thread

This job handles the asynchronous analysis of email threads using GPT-4o.
It updates the processing stage and calls the analyzer service.
"""

import logging
import os
from typing import Any, Dict

from supabase import create_client, Client

from backend.services.analyzer import analyze_thread

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


def run_analyze_thread_job(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Trigger.dev job handler for analyzing a thread.
    
    This function is called by Trigger.dev when the 'analyze-thread' task is triggered.
    
    Args:
        payload: Dictionary containing:
            - thread_id: str - The thread ID to analyze
            - user_id: str - The user ID who owns the thread
            
    Returns:
        Dictionary with job execution results
    """
    thread_id = payload.get("thread_id")
    user_id = payload.get("user_id")
    
    if not thread_id:
        raise ValueError("thread_id is required in payload")
    if not user_id:
        raise ValueError("user_id is required in payload")
    
    logger.info(f"Starting analyze-thread job for thread {thread_id}, user {user_id}")
    
    supabase = get_supabase_client()
    
    try:
        # Step 1: Update thread_processing_stages to 'analyzing'
        supabase.table("thread_processing_stages").update({
            "current_stage": "analyzing"
        }).eq("thread_id", thread_id).eq("user_id", user_id).execute()
        
        logger.info(f"Updated thread_processing_stages to 'analyzing' for thread {thread_id}")
        
        # Step 2: Call the analyzer service
        result = analyze_thread(user_id, thread_id)
        
        # Step 3: Return the result
        logger.info(f"Completed analyze-thread job for thread {thread_id}")
        return result
        
    except Exception as e:
        error_msg = f"Error in analyze-thread job for thread {thread_id}: {str(e)}"
        logger.error(error_msg, exc_info=True)
        
        # Update thread_processing_stages to failed
        try:
            supabase.table("thread_processing_stages").update({
                "current_stage": "failed"
            }).eq("thread_id", thread_id).eq("user_id", user_id).execute()
        except:
            pass
        
        raise


# For direct invocation (testing or non-Trigger.dev execution)
if __name__ == "__main__":
    import sys
    import json
    
    if len(sys.argv) < 3:
        print("Usage: python analysis_job.py <user_id> <thread_id>")
        sys.exit(1)
    
    user_id = sys.argv[1]
    thread_id = sys.argv[2]
    
    payload = {
        "user_id": user_id,
        "thread_id": thread_id
    }
    
    result = run_analyze_thread_job(payload)
    print(json.dumps(result, indent=2))



