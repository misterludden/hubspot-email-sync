# HubSpot Email Sync Backend

This backend service provides integration with multiple email providers (Gmail and Outlook) for syncing emails with HubSpot.

## Architecture

The application follows a provider-based architecture that allows for easy integration of multiple email services:

- **Email Service Interface**: Defines a common interface for all email providers
- **Provider Implementations**: Specific implementations for Gmail and Outlook
- **Service Factory**: Creates and manages provider instances
- **Generic Routes**: Routes that work with any supported email provider

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Create a `.env` file based on the `.env.example` template:
   ```
   cp .env.example .env
   ```

3. Configure your environment variables:
   - For Gmail integration: Set up Google API credentials
   - For Outlook integration: Set up Microsoft Graph API credentials

## Email Provider Setup

### Gmail Setup
1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable the Gmail API
4. Create OAuth 2.0 credentials
5. Set the authorized redirect URI to `http://localhost:5001/api/auth/gmail/callback`
6. Add the credentials to your `.env` file

### Outlook Setup
1. Go to the [Azure Portal](https://portal.azure.com/)
2. Register a new application in Azure Active Directory
3. Add the following API permissions:
   - Microsoft Graph: User.Read
   - Microsoft Graph: Mail.Read
   - Microsoft Graph: Mail.ReadWrite
   - Microsoft Graph: Mail.Send
4. Create a client secret
5. Set the redirect URI to `http://localhost:5001/api/auth/outlook/callback`
6. Add the credentials to your `.env` file

## API Endpoints

### Authentication
- `GET /api/auth/providers` - Get available email providers
- `GET /api/auth/:provider` - Generate authentication URL for a provider
- `GET /api/auth/:provider/status` - Check authentication status
- `POST /api/auth/:provider/disconnect` - Disconnect from a provider

### Email Operations
- `POST /api/email/:provider/sync` - Sync emails from a provider
- `GET /api/email/:provider/sync-status` - Check sync status
- `POST /api/email/:provider/send` - Send an email
- `POST /api/email/:provider/archive` - Archive an email

## Database Model

The Token model has been updated to support multiple email providers:
- Each token is associated with a user email and a provider
- A compound index ensures uniqueness for each user-provider combination
