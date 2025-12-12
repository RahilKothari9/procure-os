# Procure OS

Procure-OS is a “Direct-Injection” autonomous voice agent that acts as a digital procurement officer for the construction and manufacturing industries. It solves the “Last Mile” communication gap—where billions are lost to manual follow-ups—by automating high-volume supplier negotiations.

The system replaces manual “chasing” with an AI workforce. Users select high-priority leads on a React command center, which instantly injects specific 3-item order manifests into the agent’s brain. The agent then initiates a context-aware call to the supplier, negotiates delivery timelines in Hinglish (Indian English + Hindi), validates excuses against a logic matrix, and autonomously writes confirmed data back to the company’s central ERP.

## 🚀 Features

-   **Direct Data Injection**: Instantly injects specific order manifests into the agent’s context at the moment of the call.
-   **Cultural Awareness**: Supports "Hinglish" code-switching to improve vendor compliance rates.
-   **Smart Confirmation**: "Transparency Protocol" reads back data before saving to ensure integrity.
-   **Risk Escalation**: Detects critical risks (e.g., "truck breakdown") and triggers immediate escalation workflows via n8n.
-   **Real-time Status**: Visual indicators for call status (Idle, Connecting, Connected, Ended).
-   **Modern UI**: Built with Tailwind CSS for a clean and responsive interface.

## 🛠️ Tech Stack

-   **Voice AI**: ElevenLabs Conversational AI (Custom Agent with Dynamic Variables & Client Tools).
-   **Frontend**: React (Vite), Tailwind CSS, @elevenlabs/react SDK.
-   **Orchestration**: n8n (Workflow Automation).
-   **Database**: Google Sheets (via n8n integration).

## 📋 Prerequisites

Before you begin, ensure you have the following installed:
-   **Node.js** (v18 or higher recommended)
-   **npm** or **yarn**

## ⚙️ Configuration

To fully utilize the AI calling features, you need to configure the application with your specific credentials.

1.  **ElevenLabs Agent ID**:
    -   Log in to [ElevenLabs](https://elevenlabs.io/).
    -   Navigate to Agents and create or select an agent.
    -   Copy the `Agent ID`.
    -   Update the `AGENT_ID` constant in `src/App.jsx`.

2.  **Webhook URL** (Optional/Customizable):
    -   The app is configured to fetch leads from an n8n webhook.
    -   Update the `N8N_QUEUE_URL` in `src/App.jsx` if you have your own backend or n8n workflow.

## 📦 Installation

1.  **Clone the repository**:
    ```bash
    git clone <repository-url>
    cd procure-os
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Start the development server**:
    ```bash
    npm run dev
    ```

4.  **Build for production**:
    ```bash
    npm run build
    ```

## 📝 Usage

1.  Launch React Dashboard (usually `http://localhost:5173`).
2.  Select a lead (e.g., “Balaji Steel” - ID 101).
3.  Click “Start Call” to initiate the session.
4.  Roleplay delay as the supplier.
5.  Verify status update on the dashboard and check for email alerts in case of critical updates.

## 📜 Scripts

-   `npm run dev`: Starts the development server.
-   `npm run build`: Builds the app for production.
-   `npm run lint`: Runs ESLint to check for code quality issues.
-   `npm run preview`: Locally preview the production build.

## 📄 License

[MIT](LICENSE)
