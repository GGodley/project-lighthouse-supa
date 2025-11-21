-- Validation Query: Identify threads missing company links
-- This query helps identify threads that should be linked to companies but aren't

-- 1. Find threads with messages from company domains but no link to that company
SELECT DISTINCT
  t.thread_id,
  t.subject,
  t.last_message_date,
  COUNT(DISTINCT c.company_id) as companies_in_thread,
  COUNT(DISTINCT tcl.company_id) as companies_linked,
  COUNT(DISTINCT c.company_id) - COUNT(DISTINCT tcl.company_id) as missing_links
FROM threads t
JOIN thread_messages tm ON t.thread_id = tm.thread_id
JOIN customers c ON tm.customer_id = c.customer_id
LEFT JOIN thread_company_link tcl ON t.thread_id = tcl.thread_id AND c.company_id = tcl.company_id
WHERE tm.customer_id IS NOT NULL
GROUP BY t.thread_id, t.subject, t.last_message_date
HAVING COUNT(DISTINCT c.company_id) > COUNT(DISTINCT tcl.company_id)
ORDER BY missing_links DESC, t.last_message_date DESC;

-- 2. Find threads with multiple company domains but only one link
SELECT 
  t.thread_id,
  t.subject,
  t.last_message_date,
  COUNT(DISTINCT c.company_id) as unique_companies_in_thread,
  COUNT(DISTINCT tcl.company_id) as unique_companies_linked,
  STRING_AGG(DISTINCT comp.domain_name, ', ') as company_domains,
  STRING_AGG(DISTINCT comp.company_name, ', ') as company_names
FROM threads t
JOIN thread_messages tm ON t.thread_id = tm.thread_id
JOIN customers c ON tm.customer_id = c.customer_id
JOIN companies comp ON c.company_id = comp.company_id
LEFT JOIN thread_company_link tcl ON t.thread_id = tcl.thread_id AND c.company_id = tcl.company_id
WHERE tm.customer_id IS NOT NULL
GROUP BY t.thread_id, t.subject, t.last_message_date
HAVING COUNT(DISTINCT c.company_id) > 1 
  AND COUNT(DISTINCT tcl.company_id) < COUNT(DISTINCT c.company_id)
ORDER BY unique_companies_in_thread DESC, t.last_message_date DESC;

-- 3. Summary: Count threads with missing links
SELECT 
  COUNT(DISTINCT t.thread_id) as threads_with_missing_links,
  SUM(COUNT(DISTINCT c.company_id) - COUNT(DISTINCT tcl.company_id)) as total_missing_links
FROM threads t
JOIN thread_messages tm ON t.thread_id = tm.thread_id
JOIN customers c ON tm.customer_id = c.customer_id
LEFT JOIN thread_company_link tcl ON t.thread_id = tcl.thread_id AND c.company_id = tcl.company_id
WHERE tm.customer_id IS NOT NULL
GROUP BY t.thread_id
HAVING COUNT(DISTINCT c.company_id) > COUNT(DISTINCT tcl.company_id);

-- 4. Find threads that should be linked to a specific company but aren't
-- (Replace 'COMPANY_ID_HERE' with actual company_id)
SELECT 
  t.thread_id,
  t.subject,
  t.last_message_date,
  comp.company_name,
  comp.domain_name,
  COUNT(DISTINCT tm.message_id) as messages_from_company
FROM threads t
JOIN thread_messages tm ON t.thread_id = tm.thread_id
JOIN customers c ON tm.customer_id = c.customer_id
JOIN companies comp ON c.company_id = comp.company_id
LEFT JOIN thread_company_link tcl ON t.thread_id = tcl.thread_id AND comp.company_id = tcl.company_id
WHERE comp.company_id = 'COMPANY_ID_HERE' -- Replace with actual company_id
  AND tm.customer_id IS NOT NULL
  AND tcl.thread_id IS NULL
GROUP BY t.thread_id, t.subject, t.last_message_date, comp.company_name, comp.domain_name
ORDER BY t.last_message_date DESC;

