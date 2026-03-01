# AI Resume Analyzer - Debugging Guide

## Issue: "Feedback is missing or invalid" Error

If you're seeing "Feedback is missing or invalid" warning on the resume review page, follow these steps to diagnose the problem.

### Step 1: Open Browser Console
1. Press **F12** or right-click → **Inspect** → **Console** tab
2. Upload a resume and watch for these log messages:

### Step 2: Look for These Log Sections

#### ✅ If you see these logs, AI analysis is working:

```
"=== Raw AI Response ===" 
Full feedback object: {...}
Format: string content
"=== Extracted Feedback Text ===" 
Raw text: {...}
"=== Parsing Successful ===" 
Parsed feedback: {...}
"=== Data Saved Successfully ===" 
Saved to database: resume:[UUID]
```

#### ❌ If analysis is stuck at "Analyzing...":

Look for one of these error patterns:

**Problem 1: No AI Response**
```
No feedback received from AI
Error: Failed to analyze resume
```
→ Solution: Make sure you're signed in to Puter.js

**Problem 2: Invalid Response Format**
```
Unexpected feedback format
Expected string or array, got: [...]
```
→ Solution: The AI returned data in an unexpected format. Check the "Full feedback object" to see the structure.

**Problem 3: JSON Parse Error**
```
"=== JSON Parse Error ===" 
Parse error: SyntaxError: Unexpected token...
Cleaned text that failed to parse: [...]
```
→ Solution: The AI response isn't valid JSON. The "Cleaned text" shows what was parsed - it should be valid JSON.

**Problem 4: Authentication Issues**
```
Error: Puter.js not available
Error: Failed to check auth status
```
→ Solution: Puter.js didn't load. Refresh the page and make sure you have an active internet connection.

### Step 3: Check the Raw Response

If you see **Problem 2** or **Problem 3**, look at the "Full feedback object" or "Cleaned text" logs:

1. The response should be a valid JSON object with this structure:
```json
{
  "overallScore": 85,
  "ATS": {
    "score": 90,
    "tips": [...]
  },
  "toneAndStyle": {...},
  "content": {...},
  "structure": {...},
  "skills": {...}
}
```

2. If it's wrapped in markdown code blocks (```json...```), our code should remove them. If it still doesn't work, the AI might be returning something different.

### Step 4: Debug Info in UI

The resume review page now shows a "Debug Info" section (click to expand) that shows:
- Analysis Status (analyzing, completed, failed, pending)
- Resume ID
- Login status

### Step 5: Clear Cache and Retry

If you're seeing old data:
1. Open DevTools → **Application** tab
2. Click **Local Storage** and **Session Storage**
3. Delete any entries related to Puter
4. Refresh the page and try again

### Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| "Analysis is taking longer than expected" | AI service is slow or timeout reached | Refresh page after 2 minutes |
| "Invalid response format from AI" | API changed response format | Check console for exact format returned |
| Page stays on "Loading your resume analysis..." | Data wasn't saved to database | Check if previous upload succeeded |
| ATS score shows but no tips | Tips array is empty | This is valid - might be a great resume! |

### Getting Help

When reporting issues, include:
1. Screenshot of the console error
2. The `Full feedback object` from the logs
3. Browser type and version (F12 → Help → About)
4. Steps to reproduce the issue
