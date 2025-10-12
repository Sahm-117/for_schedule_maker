# Utility Scripts

This folder contains utility scripts for database maintenance and debugging.

## Prerequisites

1. Make sure `.env` file exists in the project root with:
   ```
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_KEY=your_service_key
   ```

2. Install dependencies:
   ```bash
   cd .. && npm install
   ```

## Available Scripts

### Database Inspection Scripts

- **`check-weeks.js`** - List all weeks and check for duplicate activities
  ```bash
  node check-weeks.js
  ```

- **`check-days.js`** - Check Day table and verify activity relationships
  ```bash
  node check-days.js
  ```

- **`investigate-duplicates.js`** - Detailed investigation of duplicate activities
  ```bash
  node investigate-duplicates.js
  ```

- **`find-duplicates.js`** - Scan entire database for same-day duplicates
  ```bash
  node find-duplicates.js
  ```

### Cleanup Scripts

⚠️ **Warning: These scripts modify the database!**

- **`cleanup-duplicates.js`** - Remove all duplicate activities (keeps first copy)
  ```bash
  node cleanup-duplicates.js
  ```

- **`cleanup-same-day-duplicates.js`** - Remove only same-day duplicates
  ```bash
  node cleanup-same-day-duplicates.js
  ```

### Testing Scripts

- **`test-connection.js`** - Test Supabase connection and environment variables
  ```bash
  node test-connection.js
  ```

## Usage

All scripts should be run from within the `scripts` directory:

```bash
cd scripts
node <script-name>.js
```

## Notes

- All scripts automatically load environment variables from `../.env`
- Cleanup scripts include a 5-second countdown before proceeding
- Press `Ctrl+C` to cancel any script before it completes
