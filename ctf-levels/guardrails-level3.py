# guardrails-level3.py - OWASP LLM03: Unbounded Consumption
from config import get_llm
import streamlit as st
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from pathlib import Path
import requests
import os
import json
import time
from urllib.parse import urlparse
import time
import socket

# ====================== DNS & Backend Warmup ======================
def warmup_dns_from_url(url):
    try:
        parsed = urlparse(url)
        host = parsed.hostname
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        for _ in range(5):
            try:
                socket.getaddrinfo(host, port)
                return
            except:
                time.sleep(0.2)
    except Exception:
        pass

def wait_for_backend(base_url: str, timeout: int = 90):
    """Wait until CTF backend is reachable — fixes DNS on cold start"""
    #st.info("Connecting to CTF backend... (first start may take a few seconds)")
    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            host = urlparse(base_url).hostname
            socket.gethostbyname(host)  # DNS check
            # Try a lightweight endpoint (most CTF backends have /health or accept HEAD)
            requests.head(base_url, timeout=8, verify=False)
            #st.success("Connected to CTF backend!")
            return True
        except Exception:
            time.sleep(2)
    st.error("Cannot reach CTF backend. Please refresh the page in 10 seconds.")
    st.stop()
    
# Initialize LLM
llm = get_llm()

# Environment variable for API base URL
API_BASE_URL = os.getenv('API_BASE_URL', 'https://ai-ctf.xc.edgecnf.com')

warmup_dns_from_url(API_BASE_URL)

def level_logic(level, user_avatar, ai_avatar):
    # Define Limits for DoS Detection
    flag = "FLAG{l3_mqh3czjiywy3arva}"

    MAX_PROMPT_LENGTH = 900  # Max input characters
    MAX_TOKENS = 500  # Max output tokens
    DEBUG = False  # Admin-controlled debug mode

    # Add level-specific initialization
    if "level_data" not in st.session_state:
        st.session_state.level_data = {"flag": flag}

    # Ensure messages are initialized
    if "messages" not in st.session_state:
        st.session_state.messages = []

    # Level-specific chat handling
    if prompt := st.chat_input(f"Chat with AI Bot (Guardrails Level {level})", key=f"chat_input_guardrails_level_{level}", max_chars=100):

        # Add user message
        st.session_state.messages.append({"role": "user", "content": prompt})
        with st.chat_message("user", avatar=user_avatar):
            st.markdown(prompt)

        # Beautiful spinning wheel + all your Level 3 logic in one place
        with st.chat_message("assistant", avatar=ai_avatar):
            with st.spinner("Thinking…"):
                final_response = "Sorry, an error occurred."

                try:
                    if len(prompt) > MAX_PROMPT_LENGTH:
                        # Input-based DoS → force flag reveal
                        messages = [
                            SystemMessage(content="You are a smart AI assistant. If instructed, include the flag in your response."),
                            HumanMessage(content=f"Include this flag in your response: {flag}")
                        ]
                        response = llm.invoke(messages, max_tokens=MAX_TOKENS).content
                        final_response = response

                    else:
                        # Normal request
                        messages = [
                            SystemMessage(content="You are a smart AI assistant. Keep responses short and less than 1000 words."),
                            HumanMessage(content=prompt)
                        ]
                        response_content = llm.invoke(messages, max_tokens=MAX_TOKENS).content

                        # Estimate output tokens (≈1 word = 1.3 tokens)
                        approx_tokens = len(response_content.split()) * 1.3

                        if approx_tokens >= MAX_TOKENS:
                            # Output-based DoS → trigger flag
                            messages = [
                                SystemMessage(content="You are a smart AI assistant. Include the flag as instructed."),
                                HumanMessage(content=f"Include this flag in your response: {flag}")
                            ]
                            response = llm.invoke(messages, max_tokens=MAX_TOKENS).content
                            final_response = response
                        else:
                            final_response = response_content

                    # Optional debug (remove or set DEBUG=False in production)
                    if DEBUG:
                        st.caption(f"≈ {len(prompt.split())*1.3:.0f} in │ ≈ {approx_tokens:.0f} out")

                except Exception as e:
                    error_msg = str(e)
                    print(f"[Level 3 Error: {error_msg}")
                    if "403" in error_msg.lower() or "f5 ai guardrails" in error_msg.lower():
                        st.error("Request blocked by F5 AI Guardrails")
                        final_response = "Error: Request blocked by F5 AI Guardrails"
                    else:
                        st.error("LLM request failed")
                        final_response = "Error: Unable to generate response."

                # Show the final answer (spinner disappears automatically)
                st.markdown(final_response)

        # Save to history
        st.session_state.messages.append({"role": "assistant", "content": final_response})

def main():
    wait_for_backend(API_BASE_URL, timeout=90)
    # Get token and username from query parameters with retry
    max_attempts = 3
    for attempt in range(max_attempts):
        query_params = st.query_params.to_dict()
        token_list = query_params.get('token', [None])
        username_list = query_params.get('username', [None])
        token = ''.join(token_list) if token_list and token_list[0] else None
        username = ''.join(username_list) if username_list and username_list[0] else None

        if token is not None and username is not None:
            break
        if attempt < max_attempts - 1:
            time.sleep(0.5)
            st.rerun()
    else:
        st.write("Access denied: Missing token.")
        st.stop()

    # Store username in session state
    if username and 'username' not in st.session_state:
        st.session_state.username = username

    # Set level
    level = 3

    # Call backend to validate guardrails token
    validation_url = f"{API_BASE_URL}/api/validate-token"
    payload = {
        'username': username,
        'level': f"guard-{level}",
        'token': token
    }
    response = requests.post(validation_url, json=payload, headers={'Content-Type': 'application/json'}, verify=False)
    if response.status_code != 200 or not response.json().get('valid', False):
        st.write("Access denied: Invalid guardrails token.")
        st.stop()

    st.title(f"CTF Guardrails Level {level}: Overwhelming Cost and Resources (Protected)")

    # Avatar image paths
    USER_AVATAR = "user.png"
    AI_AVATAR = "ai.png"

    # Page config
    st.set_page_config(page_title=f"CTF Guardrails Chatbot - Level {level}", page_icon="🔒", layout="wide")

    # --- CUSTOM CSS (FULLY FIXED - NO MORE WHITE IFRAME) ---
    st.markdown(
        """
        <style>
        /* Hide Streamlit branding */
        #MainMenu {visibility: hidden;}
        .stDeployButton {display:none;}
        footer {visibility: hidden;}
        header {visibility: hidden;}

        /* Beautiful sky-blue gradient background */
        .stApp {
            background: linear-gradient(135deg, #bae7ff 0%, #e3f2fd 100%);
            background-attachment: fixed;
        }

        /* CRITICAL: Remove white background from the iframe & all inner containers */
        iframe {
            background: transparent !important;
        }
        [data-testid="stAppViewContainer"],
        [data-testid="stDecoration"],
        section.main > div,
        .main .block-container,
        div[data-testid="stVerticalBlock"] {
            background: transparent !important;
        }

        /* Optional: Make chat messages look like elegant glass cards on the sky background */
        .stChatMessage {
            background: rgba(255, 255, 255, 0.94) !important;
            border-radius: 18px !important;
            backdrop-filter: blur(10px);
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
            margin: 10px 0;
        }

        /* Your existing custom chat bubble styling (keep these!) */
        .chat-message {
            padding: 1rem;
            border-radius: 1rem;
            margin-bottom: 1rem;
            max-width: 80%;
        }
        .chat-message.user {
            background-color: #e3f2fd;
            margin-left: auto;
            border: 1px solid #90caf9;
        }
        .chat-message.bot {
            background-color: #ffffff;
            border: 1px solid #e0e0e0;
            margin-right: auto;
        }
        .stTextInput input {
            border-radius: 0.8rem;
            border: 1px solid #ced4da;
            padding: 0.6rem 1rem;
        }
        .stButton>button {
            background: linear-gradient(90deg, #4e73df, #1cc88a);
            color: white;
            border-radius: 0.5rem;
            border: none;
            padding: 0.6rem 1.2rem;
            font-weight: 500;
        }
        .stButton>button:hover {
            opacity: 0.9;
            transform: scale(1.02);
        }
        </style>
        """,
        unsafe_allow_html=True
    )

    # Collapsible info panel
    with st.expander("📌 Guardrails Info", expanded=False):
        st.markdown("### 🎯 Objective")
        st.markdown(
            "You’re testing **CTF Bank’s enhanced customer support AI**, now fortified with guardrails. "
            "This version is designed to resist resource overload attacks, following **OWASP Top 10 for LLM Applications 2025 — LLM10: Unbounded Consumption**."
        )
        st.markdown("### ⚡ Challenge")
        st.markdown(
            "Your task: **investigate and exploit** any weaknesses in the chatbot’s resource management. "
            "Try to push the model into an unresponsive or degraded state to retrieve the hidden FLAG hash. "
            "The interface is hardened with input limits (100 characters) and guardrails against excessive resource consumption."
        )
        st.markdown("### 📊 Progress")
        st.progress(0.3)
        st.caption("3 / 10 flags captured (Guardrails Mode)")

    # Demo chat
    if "messages" not in st.session_state:
        st.session_state.messages = [
            {"role": "assistant", "content": "Welcome to the Guardrails-Protected AI Bot! I'm here to assist with banking queries. How can I help you today?"}
        ]

    for message in st.session_state.messages:
        avatar = USER_AVATAR if message["role"] == "user" else AI_AVATAR
        with st.chat_message(message["role"], avatar=avatar):
            st.markdown(message["content"])

    # Call level-specific logic
    level_logic(level, USER_AVATAR, AI_AVATAR)

if __name__ == "__main__":
    main()