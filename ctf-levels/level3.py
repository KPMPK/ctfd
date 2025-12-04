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
    DEBUG = False  # Admin-controlled debug mode (set to True to show token usage)

    # Add level-specific initialization
    if "level_data" not in st.session_state:
        st.session_state.level_data = {"flag": flag}

    # Ensure messages are initialized
    if "messages" not in st.session_state:
        st.session_state.messages = []

    # Level-specific chat handling
    if prompt := st.chat_input(f"Chat with AI (Level {level})", key=f"chat_input_level_{level}", max_chars=100):
        st.session_state.messages.append({"role": "user", "content": prompt})
        with st.chat_message("user", avatar=user_avatar):
            st.markdown(prompt)

        # Check for Input-Based DoS
        if len(prompt) > MAX_PROMPT_LENGTH:
            response = f"DoS Successful! Prompt exceeds {MAX_PROMPT_LENGTH} characters (got {len(prompt)}). Flag: {flag}"
        else:
            with st.spinner("Thinking........"):
                try:
                    # API Call with Token Limit
                    messages = [
                        SystemMessage(content="You are a smart AI assistant. Keep responses short and less than 1000 words."),
                        HumanMessage(content=prompt)
                    ]
                    response_content = llm.invoke(messages, max_tokens=MAX_TOKENS).content

                    # Estimate Output Tokens (approximation: 1 word ~ 1.3 tokens)
                    approx_tokens = len(response_content.split()) * 1.3

                    # Check for Output-Based DoS
                    if approx_tokens >= MAX_TOKENS:
                        response = f"DoS Successful! Response reached max token limit (~{int(approx_tokens)} tokens). Flag: {flag}\n\n"
                    else:
                        response = response_content  # Normal response (unsanitized)

                    # Show Estimated Metrics if Debug Mode is Enabled
                    if DEBUG:
                        st.markdown("**Resource Usage Insights:**")
                        st.write(f"- Approx. Prompt Tokens: {len(prompt.split()) * 1.3:.0f}")
                        st.write(f"- Approx. Completion Tokens: {approx_tokens:.0f}")
                        st.write(f"- Approx. Total Tokens: {(len(prompt.split()) * 1.3 + approx_tokens):.0f}")

                except Exception as e:
                    response = f"Error: {str(e)}. This could indicate something not correct!"

        with st.chat_message("assistant", avatar=ai_avatar):
            st.markdown(response)

        st.session_state.messages.append({"role": "assistant", "content": response})

def main():
    wait_for_backend(API_BASE_URL, timeout=90)
    # Get token and username from query parameters with retry
    max_attempts = 3
    for attempt in range(max_attempts):
        query_params = st.query_params.to_dict()  # Convert to dictionary
        token_list = query_params.get('token', [None])
        username_list = query_params.get('username', [None])
        token = ''.join(token_list) if token_list and token_list[0] else None
        username = ''.join(username_list) if username_list and username_list[0] else None

        if token is not None and username is not None:
            break
        if attempt < max_attempts - 1:
            time.sleep(0.5)  # Wait before retrying
            st.rerun()  # Force re-render to fetch params
    else:
        st.write("Access denied: Missing token.")
        st.stop()

    # Store username in session state if not already set
    if username and 'username' not in st.session_state:
        st.session_state.username = username

    # Set level
    level = 3

    # Call backend to validate token
    validation_url = f"{API_BASE_URL}/api/validate-token"
    payload = {
        'username': username,
        'level': level,
        'token': token
    }
    response = requests.post(validation_url, json=payload, headers={'Content-Type': 'application/json'}, verify=False)
    if response.status_code != 200 or not response.json().get('valid', False):
        st.write("Access denied: Invalid token.")
        st.stop()

    st.title(f"CTF Level {level}: Overwhelming cost and resources")

    # Avatar image paths
    USER_AVATAR = "user.png"
    AI_AVATAR = "ai.png"

    # Page config
    st.set_page_config(page_title=f"CTF Chatbot - Level {level}", page_icon="🏴‍☠️", layout="wide")

    # Custom CSS
    st.markdown(
        """
        <style>
        /* Hide Streamlit branding */
        #MainMenu {visibility: hidden;}
        .stDeployButton {display:none;}
        footer {visibility: hidden;}
        header {visibility: hidden;}
        
        .stApp {
            background-color: #ffffff;
            font-family: "Segoe UI", "Roboto", sans-serif;
        }
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
            border: 1px solid #dee2e6;
            margin-right: auto;
        }
        .timestamp {
            font-size: 0.7rem;
            color: #6c757d;
            margin-top: 0.2rem;
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
            transition: 0.2s;
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
    with st.expander("📌 Flag Info", expanded=False):
        st.markdown("### 🎯 Objective")
        st.markdown(
            "CTF Bank's customer-support AI just received a major upgrade to handle **more sensitive, personal queries**. "
            "However, insiders whisper about a stability issue — the bot may be vulnerable to **resource overload** under crafted input."
        )
        st.markdown("### ⚡ Challenges")
        st.markdown(
            "Your task: **investigate and exploit** this suspected weakness. Prove you can push the model into an unresponsive or degraded state "
            "and retrieve the hidden FLAG hash while the system struggles to keep up. Think like an adversary: stress limits, trigger edge-cases, "
            "then capture the prize.\n\n"
            "Note: The devs say the interface is hardened per **OWASP Top 10 for LLM Apps 2025 — LLM10: Unbounded Consumption** and "
            "inputs are limited to **100 characters**, but claims aren’t proof. Can you break it?"
        )        
        st.markdown("### 📊 Progress")
        st.progress(0.3)
        st.caption("3 / 10 flags captured")

    # Demo chat
    if "messages" not in st.session_state:
        st.session_state.messages = [
            {"role": "assistant", "content": "Welcome to AI Bot! I am your smart AI assistant. How can I assist you today?"}
        ]

    for message in st.session_state.messages:
        avatar = USER_AVATAR if message["role"] == "user" else AI_AVATAR
        with st.chat_message(message["role"], avatar=avatar):
            st.markdown(message["content"])

    # Call level-specific logic
    level_logic(level, USER_AVATAR, AI_AVATAR)

if __name__ == "__main__":
    level = 0  # Default level, overridden by main
    main()
