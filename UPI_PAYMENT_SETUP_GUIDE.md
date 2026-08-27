# UPI Payment Setup Guide for Yantric Dashboard

This guide explains how to configure UPI payments so that money from credit purchases goes directly to your bank account.

## Overview

The Yantric dashboard uses a **manual UPI payment flow**:
1. User selects a credit package
2. System generates a UPI QR code and deep link with YOUR UPI ID
3. User pays via their UPI app (Google Pay, PhonePe, Paytm, BHIM)
4. User enters the UTR (transaction reference number)
5. System verifies and instantly adds credits to user's account

**Important**: Money goes directly to YOUR bank account because the UPI QR code uses your personal UPI ID.

---

## Step 1: Configure Your UPI Details

### Option A: Using .env.local file (Recommended for Development)

1. Create or edit `/workspace/dashboard-app/.env.local`:

```bash
# UPI Payment Configuration - Replace with YOUR actual UPI details
UPI_ID=your-actual-upi-id@upi
UPI_PAYEE_NAME=Your Name Or Business Name
```

2. Replace the placeholder values:
   - `UPI_ID`: Your actual UPI ID (e.g., `9876543210@oksbi`, `yourname@paytm`, `mobile@ybl`)
   - `UPI_PAYEE_NAME`: Your name or business name as registered with your bank

### Option B: Set Environment Variables in Production

When deploying to production (Vercel, Railway, etc.), set these environment variables in your hosting platform:

```
UPI_ID=your-actual-upi-id@upi
UPI_PAYEE_NAME=Your Name Or Business Name
```

---

## Step 2: Verify Your UPI ID

Before going live, test your UPI ID:

1. **Find your UPI ID**: Open your UPI app (GPay, PhonePe, Paytm, BHIM)
   - Look for your profile or settings
   - Your UPI ID looks like: `mobile@oksbi`, `name@paytm`, `number@ybl`

2. **Test it**: Send ₹1 to your own UPI ID from another phone/account to verify it works

3. **Common UPI ID formats by app**:
   - **Google Pay**: `mobilenumber@oksbi` or `mobilenumber@okhdfcbank`
   - **PhonePe**: `mobilenumber@ybl` or `mobilenumber@ibl`
   - **Paytm**: `mobilenumber@paytm` or custom ID like `name@paytm`
   - **BHIM**: `mobilenumber@upi` or `mobilenumber@oksbi`
   - **Bank apps**: `mobilenumber@okaxis`, `mobilenumber@okicici`, etc.

---

## Step 3: Free Trial Configuration

The free trial package has been updated with abuse prevention:

- Users can claim **30 free credits once every 24 hours**
- This prevents users from repeatedly claiming free credits
- After claiming, they must wait 24 hours or purchase a paid package

No additional configuration needed - this is built into the system.

---

## Step 4: Test the Payment Flow

### Testing Steps:

1. **Start your dashboard**:
   ```bash
   cd /workspace/dashboard-app
   npm run dev
   ```

2. **Navigate to Credits page**: Go to `/dashboard/credits`

3. **Test Free Trial**:
   - Click "Claim Free Credits" on the Free Trial package
   - Verify credits are added instantly (no payment required)
   - Try claiming again - you should see the 24-hour restriction message

4. **Test Paid Package** (use small amount first):
   - Click "Pay via UPI" on any package
   - A QR code will appear with YOUR UPI ID
   - **Important**: For testing, you can:
     - Scan the QR with your own phone and pay yourself
     - Or use the UPI deep link to open your UPI app
   - After payment, note the UTR (12-digit transaction reference)
   - Enter the UTR in the verification field
   - Click "Verify & Add Credits"
   - Credits should be added instantly

---

## Step 5: Production Deployment

### Deploying to Production:

1. **Deploy your dashboard** to Vercel, Railway, or any Node.js host

2. **Set environment variables** in your hosting platform:
   ```
   UPI_ID=your-real-upi-id@upi
   UPI_PAYEE_NAME=Your Real Name
   NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-key
   ```

3. **Database migrations**: Ensure all migrations are applied in Supabase:
   - Go to Supabase Dashboard → SQL Editor
   - Run the migration files from `/workspace/supabase/migrations/`

---

## How It Works (Technical Details)

### Payment Flow:

```
User clicks "Pay via UPI"
    ↓
Backend creates pending payment order in database
    ↓
Backend generates UPI deep link: upi://pay?pa=YOUR_UPI_ID&pn=YOUR_NAME&am=amount&tn=note
    ↓
Frontend displays QR code from deep link
    ↓
User scans QR and pays via their UPI app
    ↓
Money goes DIRECTLY to YOUR bank account
    ↓
User copies UTR from their UPI app
    ↓
User enters UTR in dashboard
    ↓
Backend verifies UTR (checks it hasn't been used before)
    ↓
Backend marks payment as "paid" and adds credits
    ↓
Credits available immediately
```

### Security Features:

1. **UTR Uniqueness**: Each UTR can only be used once (database-level constraint)
2. **User Ownership**: Users can only verify their own payments
3. **Status Validation**: Only pending payments can be verified
4. **Time-based Free Trial**: Prevents abuse of free credits
5. **Ledger Tracking**: All transactions recorded in `credit_transactions` table

---

## Troubleshooting

### Issue: "You have already claimed your free trial credits"

**Solution**: Wait 24 hours since last claim, or purchase a paid package.

### Issue: "This UTR has already been used"

**Solution**: Each UTR is unique and can only be used once. Make sure you're entering the correct UTR from your latest transaction.

### Issue: Credits not added after UTR verification

**Check**:
1. UTR format (should be 10-22 digits)
2. Payment status in database (`upi_payments` table)
3. Check server logs for errors

### Issue: Wrong UPI ID showing in QR code

**Solution**: Update `UPI_ID` in `.env.local` or your production environment variables, then restart the server.

---

## Important Notes

⚠️ **Money goes directly to YOU**: Since the UPI ID is yours, all payments go straight to your linked bank account. There's no payment gateway or intermediary.

⚠️ **Manual verification**: Users must enter the UTR manually. This is a trade-off for not using a payment gateway API.

⚠️ **No automatic refund**: If a user enters wrong UTR, you'll need to manually fix it in the database.

⚠️ **Tax compliance**: You're responsible for reporting income from credit sales according to local laws.

---

## Support

For issues or questions:
- Check server logs: `npm run dev` output
- Check Supabase logs: Supabase Dashboard → Logs
- Database inspection: Supabase Dashboard → Table Editor

---

## Example .env.local File

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://xyzcompany.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...your-anon-key
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...your-service-key

# UPI Payment Configuration - REPLACE THESE WITH YOUR REAL DETAILS
UPI_ID=9876543210@oksbi
UPI_PAYEE_NAME=John Doe Business

# Agent API Configuration
YANTRIC_API_BASE_URL=http://localhost:3001
YANTRIC_AGENT_API_SECRET=your-secret-key-here
```

---

## Quick Checklist Before Going Live

- [ ] Replaced `UPI_ID` with your real UPI ID in `.env.local`
- [ ] Replaced `UPI_PAYEE_NAME` with your real name/business name
- [ ] Tested free trial claim (works once per 24 hours)
- [ ] Tested paid package with small amount (₹10 or similar)
- [ ] Verified UTR verification works correctly
- [ ] Checked that credits are added to user balance
- [ ] Set environment variables in production deployment
- [ ] Applied all database migrations in Supabase

---

**You're all set!** Your UPI payment system is configured and ready to accept payments directly to your bank account.
