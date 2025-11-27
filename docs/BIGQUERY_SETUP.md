# BigQuery Setup Guide

## Problem
The service account `wizard-admin@botson-playground.iam.gserviceaccount.com` lacks permission to write data to the BigQuery table `botson-playground:llm_analytics.usage_logs`.

## Solution

You need to grant the service account **BigQuery Data Editor** permissions. Follow **ONE** of the methods below:

---

## Method 1: Google Cloud Console (Easiest)

### Step 1: Navigate to BigQuery
1. Go to [Google Cloud Console - BigQuery](https://console.cloud.google.com/bigquery?project=botson-playground)
2. Make sure you're in the `botson-playground` project

### Step 2: Grant Dataset Permissions
1. In the left sidebar, expand your project `botson-playground`
2. Find and click on the `llm_analytics` dataset
3. Click the **SHARING** button (or three dots → **Share**)
4. Click **Permissions**
5. Click **+ ADD PRINCIPAL**
6. In "New principals", enter: `wizard-admin@botson-playground.iam.gserviceaccount.com`
7. In "Select a role", choose: **BigQuery Data Editor**
8. Click **SAVE**

---

## Method 2: gcloud CLI (If you have owner permissions)

Run this command:

```bash
gcloud projects add-iam-policy-binding botson-playground \
  --member='serviceAccount:wizard-admin@botson-playground.iam.gserviceaccount.com' \
  --role='roles/bigquery.dataEditor' \
  --condition=None
```

---

## Method 3: bq CLI (Dataset-level permissions)

If you're the dataset owner, you can grant access at the dataset level:

```bash
# First, get the current access list
bq show --format=prettyjson botson-playground:llm_analytics > dataset_access.json

# Edit the file to add this entry to the "access" array:
# {
#   "role": "WRITER",
#   "userByEmail": "wizard-admin@botson-playground.iam.gserviceaccount.com"
# }

# Then update the dataset
bq update --source dataset_access.json botson-playground:llm_analytics
```

---

## Verification

After granting permissions, run this test script to verify:

```bash
node scripts/verify-bigquery-permissions.js
```

You should see:
```
✅ SUCCESS! BigQuery permissions are configured correctly
Test data inserted successfully
```

---

## Required Permissions

The service account needs one of these:

- **Project Level**: `roles/bigquery.dataEditor` (recommended)
- **Dataset Level**: `WRITER` role on the `llm_analytics` dataset
- **Specific Permission**: `bigquery.tables.updateData` on the `usage_logs` table

---

## Troubleshooting

### Error: "Permission bigquery.tables.updateData denied"
- You haven't granted the permissions yet. Follow Method 1 above.

### Error: "You don't have permission to modify IAM"
- You need to ask a project owner or administrator to grant the permissions for you.
- Share this document with them.

### Error: "Table may not exist"
- The table exists (we can see it in the screenshots).
- This is a misleading error message - it's actually a permissions issue.

---

## What's Been Fixed in the Code

The following improvements have been made to handle BigQuery integration:

1. **Data Transformation** ([bigquery-client/index.js:173-238](packages/data/src/dbs/bigquery-client/index.js#L173-L238))
   - Added `transformRowForBigQuery()` function to convert camelCase to snake_case
   - Ensures proper type conversion (strings, numbers, timestamps)
   - Handles nullable fields correctly

2. **Error Handling** ([llm-usage-ledger.js:201-230](services/api-gateway/src/services/llm-usage-ledger.js#L201-L230))
   - Better error detection for permission issues
   - Helpful hints in log messages
   - Graceful fallback to Firestore-only mode

3. **Test Scripts**
   - `scripts/verify-bigquery-permissions.js` - Test permissions
   - `scripts/grant-bigquery-access.js` - Attempt to grant access (requires permissions)

---

## Next Steps

1. Grant the BigQuery permissions using Method 1 (Console)
2. Run the verification script
3. Restart your application
4. Test by making an API call that triggers LLM usage
5. Check BigQuery console to see the data

The application will continue to work with Firestore-only mode until BigQuery permissions are granted.
