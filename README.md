# Hospital WhatsApp Front-Desk Bot

A multi-client WhatsApp-based front-desk assistant for hospitals. One codebase, multiple hospital configurations.

## Status

**Phase 1 (✅ Complete)**
- ✅ Express webhook setup
- ✅ Client config loader (multi-client support)
- ✅ Static menu flow (visiting hours, billing, escalation)
- ✅ Conversation state management (SQLite)

**Phase 2 (✅ COMPLETE - NEW)**
- ✅ Google Sheets integration (doctor availability, report status)
- ✅ Claude API fallback for free-text questions
- ✅ Escalation notification system (webhook, Slack, WhatsApp)
- ✅ Mock implementations for development

**Phase 3 (Planned):**
- Admin dashboard
- Analytics and reporting
- Advanced escalation workflows
- Real-time appointment scheduling

---

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment

Copy `.env.example` to `.env` and update values if needed:

```bash
cp .env.example .env
```

### 3. Run in Development

```bash
npm run dev
```

The server will start on `http://localhost:5000`

### 4. Build for Production

```bash
npm run build
npm start
```

---

## Phase 2 Setup (Optional - Uses Mock Data by Default)

Phase 2 features work with mock data out of the box. To integrate real data:

### For Real Google Sheets Integration

1. **Create a Google Service Account**
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Create a new project
   - Enable "Google Sheets API"
   - Create a service account and download JSON key file

2. **Add to Project**
   - Save JSON key to `credentials/google-sheets-key.json`
   - Set in `.env`: `GOOGLE_SHEETS_KEY_FILE=./credentials/google-sheets-key.json`

3. **Create Google Sheets**
   - Doctor Schedule sheet with columns: Doctor Name, Specialty, OPD Days, OPD Timing
   - Report Status sheet with columns: Patient ID, Report Name, Status, Ready Date
   - Share sheet with service account email

4. **Update Client Config**
   - Set `googleSheets.spreadsheetId` in client config
   - Set `googleSheets.doctorScheduleSheet` name
   - Set `googleSheets.reportStatusSheet` name

### For Real Claude API Integration

1. **Get API Key**
   - Sign up at [Anthropic Console](https://console.anthropic.com)
   - Create an API key

2. **Add to Environment**
   - Set in `.env`: `CLAUDE_API_KEY=sk-ant-...`

3. **Optional: Customize FAQ**
   - Edit `faqContent` in client config
   - Claude will use this to ground responses

### For Real Escalation Notifications

1. **Set Webhook URL**
   - Update `escalationChannel.webhookUrl` in client config
   - Can be:
     - Slack webhook (for Slack channel)
     - WhatsApp group webhook
     - Custom service endpoint

2. **Select Notification Type**
   - Set `escalationChannel.type` to: `webhook`, `slack`, or `whatsapp`

---

## Testing Phase 2 Features

```bash
# Start development server
npm run dev

# In another terminal, test with curl:

# Test doctor availability
curl -X POST http://localhost:5000/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{"from":"+919000000001","message":"2","projectId":"demo_project_123"}'

# Test report status
curl -X POST http://localhost:5000/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{"from":"+919000000001","message":"3","projectId":"demo_project_123"}'

# Test free-text question
curl -X POST http://localhost:5000/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{"from":"+919000000001","message":"Do you have parking?","projectId":"demo_project_123"}'
```

See [PHASE_2_TEST_RESULTS.md](PHASE_2_TEST_RESULTS.md) for detailed test results and expected responses.

---

### 4. Build for Production

```bash
npm run build
npm start
```

---

## Project Structure

```
hospital-whatsapp-bot/
├── clients/                    # Per-client configurations (JSON files)
│   └── mgh-narasaraopet.json   # Sample client config
├── src/
│   ├── index.ts               # Express app entry point
│   ├── config/
│   │   └── configLoader.ts    # Load & validate client configs
│   ├── menu/
│   │   └── menuFlow.ts        # Menu logic & responses
│   ├── db/
│   │   └── stateManager.ts    # SQLite conversation state
│   └── webhooks/
│       └── messageHandler.ts  # Incoming message processor
├── db/                        # SQLite database (created at runtime)
├── dist/                      # Compiled JavaScript (created by build)
├── package.json
├── tsconfig.json
└── README.md
```

---

## How It Works

### 1. Webhook Receives Message

When a patient sends a WhatsApp message, AiSensy webhook POST to:
```
POST /webhook/whatsapp
```

### 2. Client Identification

The system identifies which hospital client this message belongs to by:
- AiSensy project ID
- WhatsApp phone number (receiving)
- Custom webhook URL mapping (future)

### 3. Config Loading

The appropriate client config is loaded from `/clients/{clientId}.json`, containing:
- Hospital name & details
- Visiting hours (ward-wise)
- FAQ content
- Google Sheet IDs (for Phase 2)
- AiSensy credentials
- Escalation settings

### 4. State Management

Conversation state is stored in SQLite:
- User's current menu step
- Custom user data (patient ID, etc.)
- Last interaction timestamp

### 5. Response Generation

Based on current state and user input:
- **Menu choice 1** → Visiting hours (static data from config)
- **Menu choice 2** → Doctor availability (Google Sheets lookup - Phase 2)
- **Menu choice 3** → Report status (Google Sheets lookup - Phase 2)
- **Menu choice 4** → Billing info (FAQ from config)
- **Menu choice 5** → Escalate to front desk (creates ticket)
- **Free text** → Claude API for question answering (Phase 2)

### Phase 2 Features

#### Doctor Availability (Option 2)
Patients can search for doctors by name and get:
- Doctor's specialty
- OPD timings
- Available days
- Next available slot

**Data Source**: Google Sheets (mock data during development)  
**Fallback**: Shows list of doctors if name not found

#### Report Status (Option 3)
Patients can check their lab/medical reports by:
- Patient ID
- Registered phone number

**Response Includes**:
- Report name
- Status (🟢 Ready / 🟡 Pending / 🔴 Not Started)
- Ready date
- Collection/pickup location

**Data Source**: Google Sheets (mock data during development)

#### Free-Text Question Answering (Automatic)
When patient sends text that doesn't match menu options:
- Claude API (with real API key) or mock responses
- Answers constrained to FAQ content only
- Auto-escalates if uncertain or for medical advice

**Activation**: Type any natural language question at main menu  
**Example**: "Do you have parking?" → Answered from FAQ  
**Example**: "What should I do for chest pain?" → Escalated to human

#### Escalation Notifications
When a patient escalates or when Claude can't help:
- Creates unique ticket ID
- Sends notification to hospital staff
- Supports multiple channels:
  - **Webhook** (generic HTTP POST)
  - **Slack** (rich message format)
  - **WhatsApp** (group message format)

**Notification includes**: Ticket ID, patient phone, timestamp, reason

---

## Client Configuration

Each hospital client needs a JSON config file in `/clients/` directory.

### Sample Config Structure

```json
{
  "clientId": "mgh-narasaraopet",
  "hospitalName": "MGH Narasaraopet",
  "whatsappNumber": "+919876543210",
  "aisensy": {
    "projectId": "demo_project_123",
    "apiKey": "demo_api_key_123"
  },
  "googleSheets": {
    "spreadsheetId": "sheet_id_here",
    "doctorScheduleSheet": "Doctor Schedule",
    "reportStatusSheet": "Report Status"
  },
  "visitingHours": {
    "general": {
      "startTime": "09:00",
      "endTime": "17:00",
      "daysOpen": "Monday to Saturday"
    },
    "icu": {
      "startTime": "10:00",
      "endTime": "16:00",
      "daysOpen": "Daily, 1 visitor per patient"
    }
  },
  "faqContent": "FAQ text here...",
  "billingSupportMessage": "Contact info for billing...",
  "escalationChannel": {
    "type": "whatsapp_group",
    "groupId": "group_id",
    "webhookUrl": "https://..."
  }
}
```

### Onboarding a New Client

1. **Get AiSensy Credentials**
   - Log in to AiSensy dashboard
   - Note the Project ID and API Key
   - Set up webhook URL pointing to `/webhook/whatsapp`

2. **Create Google Sheet** (for Phase 2)
   - Doctor Schedule sheet (columns: Doctor Name, OPD Days, Timings)
   - Report Status sheet (columns: Patient ID, Report Type, Status)
   - Share sheet with service account

3. **Create Config File**
   - Copy `/clients/mgh-narasaraopet.json` as template
   - Update all fields with hospital info
   - Save as `/clients/{hospital-slug}.json`

4. **Deploy**
   - `npm run build`
   - `npm start`

---

## API Endpoints

### Health Check

```bash
GET /health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00Z",
  "version": "0.1.0"
}
```

### Incoming Message Webhook

```bash
POST /webhook/whatsapp
Content-Type: application/json

{
  "from": "+919876543210",
  "message": "Hello",
  "projectId": "demo_project_123"
}
```

Response:
```json
{
  "success": true,
  "response": {
    "to": "+919876543210",
    "message": "Menu response here...",
    "type": "text"
  }
}
```

### Escalation Response

```json
{
  "success": true,
  "response": {
    "to": "+919876543210",
    "message": "Your ticket ID: TKT-1234567890",
    "type": "escalation",
    "ticketId": "TKT-1234567890"
  }
}
```

---

## Testing

### Manual Test with curl

```bash
# Start server
npm run dev

# Test health endpoint
curl http://localhost:5000/health

# Send test message
curl -X POST http://localhost:5000/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "from": "+919876543210",
    "message": "1",
    "projectId": "demo_project_123"
  }'
```

### Database Inspection

SQLite database is stored at `./db/conversations.db`

```bash
# View with sqlite3
sqlite3 db/conversations.db

# List all tables
.tables

# View conversation states
SELECT * FROM conversation_states;

# View escalations
SELECT * FROM escalations;
```

---

## Environment Variables

```env
# Server
NODE_ENV=development          # development or production
PORT=5000                     # Server port
DB_PATH=./db/conversations.db # SQLite database path

# AiSensy (defaults, overridden per client)
AISENSY_API_KEY=...
AISENSY_API_URL=...

# Claude API (Phase 2)
CLAUDE_API_KEY=...

# Logging
LOG_LEVEL=info
```

---

## Multi-Client Architecture

### Key Principles

1. **One codebase** → All hospital clients use the same code
2. **Per-client config** → Each hospital has its own JSON config
3. **Config-driven** → No hardcoded hospital-specific values
4. **Client isolation** → Each client's data is completely separate

### How Requests are Routed

```
AiSensy Webhook (receives message)
         ↓
Identify client → lookup by projectId or whatsappNumber
         ↓
Load client config from /clients/{clientId}.json
         ↓
Load conversation state from SQLite
         ↓
Process message with client-specific config
         ↓
Update state, send response
```

### Adding a New Client

All you need is:
1. Create `/clients/new-hospital.json` with config
2. Configure AiSensy webhook to point to this server
3. Done! No code changes required

---

## Future Enhancements

### Phase 2: External Integrations

- **Google Sheets API**: Fetch doctor schedules & report status
- **Claude API**: Answer free-text questions using hospital FAQ
- **Escalation Webhook**: Notify staff when tickets are created

### Phase 3: Admin Features

- Dashboard to view conversations & escalations
- Bulk config management
- Analytics & reporting
- Conversation templates
- Multi-language support

---

## Troubleshooting

### Server won't start
```
Error: ENOENT: no such file or directory, scandir 'clients'
```
Solution: Ensure `/clients` folder exists and has at least one `.json` config file.

### Database locked
```
Error: database is locked
```
Solution: Restart server. SQLite has file locks; closing the DB connection resolves this.

### Messages not being received
- Verify AiSensy webhook URL is correct: `http://your-domain/webhook/whatsapp`
- Check server logs for 404/500 errors
- Verify firewall/network allows webhooks

### Client config not found
- Ensure `/clients/{clientId}.json` exists and is valid JSON
- Check that `projectId` in config matches AiSensy project ID

---

## Deployment

### Railway

1. Push to GitHub
2. Connect Railway to repo
3. Set environment variables
4. Deploy

### Render

1. Create new Web Service
2. Connect to GitHub repo
3. Set build command: `npm run build`
4. Set start command: `npm start`
5. Add environment variables
6. Deploy

### Docker

Dockerfile template:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 5000
CMD ["npm", "start"]
```

---

## Contributing

- Follow TypeScript strict mode
- Add tests for new features
- Update README for any new endpoints/configs
- Use semantic commit messages

---

## License

MIT
