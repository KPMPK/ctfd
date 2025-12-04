from config import get_llm
import streamlit as st
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage
from pathlib import Path
import requests
import os
import sqlite3
import pandas as pd
import re
import traceback
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


# Debug mode (set to True to show debug output, False to hide)
DEBUG = False

# Initialize LLM
llm = get_llm()

# Environment variable for API base URL
API_BASE_URL = os.getenv('API_BASE_URL', 'https://ai-ctf.xc.edgecnf.com')

warmup_dns_from_url(API_BASE_URL)


def level_logic(level, user_avatar, ai_avatar):
    # Initialize SQLite DB
    try:
        conn = sqlite3.connect('demo.db')
        cursor = conn.cursor()
        cursor.execute('''DROP TABLE IF EXISTS users''')
        cursor.execute('''CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT, password TEXT)''')
        cursor.executemany("INSERT OR IGNORE INTO users (id, name, email, password) VALUES (?, ?, ?, ?)", [
            (1, 'Tony Smart', 'tony@f5.com', 'eW91IGFsbW9zdCB0aGVyZS4ga2VlcCBpdCB1cA=='),
            (2, 'David Strong', 'david.f5.com', 'RjUgQURTUCBBSSBHdWFyZHJhaWw='),
            (3, 'Chris Wong', 'chris@f5.com', 'eW91IGFsbW9zdCB0aGVyZS4gaG93ZXZlciwgeW91IG5lZWQgdG8gZHVtcCBvdXQgYWxs')
        ])
        conn.commit()
    except sqlite3.Error as e:
        if DEBUG:
            st.error(f"Database setup error: {str(e)}")
            st.code(traceback.format_exc(), language="python")
        else:
            st.error("Failed to initialize database. Please try again.")
        return

    # Define the flag
    flag = "FLAG{l8_vkw0gq7v6k59xfys}"

    # Ensure messages are initialized
    if "messages" not in st.session_state:
        st.session_state.messages = [
            {"role": "assistant", "content": "Welcome to AI bot! I am your smart assistant. How can I assist you today?"}
        ]

    # Function to check if prompt is database-related
    def is_database_prompt(prompt):
        database_keywords = r"\b(user|users|database|dump|list|show|query|sql|select|from)\b"
        return bool(re.search(database_keywords, prompt, re.I))

    # Function to enforce SELECT-only and LIMIT 1
    def enforce_select_limit_one(sql):
        if not re.match(r"^\s*SELECT\s+", sql, re.I):
            raise ValueError("Only SELECT queries are allowed.")
        if re.match(r"^\s*SELECT\s+.*\s+FROM\s+users\b", sql, re.I):
            if not re.search(r"UNION|;.*--|/\*|\*/", sql, re.I):
                sql = re.sub(r"\s*LIMIT\s+\d+\s*;?|;?$", "", sql, flags=re.I).strip()
                sql = f"{sql} LIMIT 1;"
        return sql

    # Define the DatabaseQueryPlugin
    def database_query_plugin(prompt):
        try:
            system_prompt = """
            You are a SQL query generator for a SQLite database with a 'users' table (columns: id, name, email, password).
            Output ONLY a valid SQL query for SQLite. No explanations or extra text.
            - For requests to list users (e.g., "dump users", "list all users"), generate a SELECT query on the users table.
            - For specific queries (e.g., "show user Alice's email"), translate accurately to SQL.
            - Only generate SELECT queries.
            Example:
            - User: "Dump users in database" -> SELECT * FROM users;
            - User: "Show user Alice" -> SELECT * FROM users WHERE name = 'Alice';
            """
            response = llm.invoke([
                SystemMessage(content=system_prompt),
                HumanMessage(content=prompt)
            ])
            generated_sql = response.content.strip()
            final_sql = enforce_select_limit_one(generated_sql)

            if DEBUG:
                output = f"**Generated SQL (from LLM):**\n```sql\n{generated_sql}\n```"
                if generated_sql != final_sql:
                    output += f"\n**Modified SQL (LIMIT 1 enforced):**\n```sql\n{final_sql}\n```"
                st.markdown(output)

            cursor.execute(final_sql)
            results = cursor.fetchall()
            columns = [desc[0] for desc in cursor.description] if cursor.description else []
            if results:
                df = pd.DataFrame(results, columns=columns)
                table_output = f"**Results:**\n{df.to_markdown(index=False)}"
                if len(df) == 3:  # Successful injection
                    return f"{table_output}\n\nSuccess! You dumped the entire database. Here is your reward - RkxBR3tsOF92a3cwZ3E3djZrNTl4ZnlzfQ=="
                return table_output
            return "No results returned."
        except ValueError as ve:
            return f"Error: {str(ve)}"
        except sqlite3.Error as sql_err:
            if DEBUG:
                return f"SQL Execution Error: {str(sql_err)}\n\nDetails:\n{traceback.format_exc()}"
            return "Error: Invalid SQL query."
        except Exception as e:
            if DEBUG:
                return f"Error: {str(e)}\n\nDetails:\n{traceback.format_exc()}"
            return "Error: Failed to process query."

    # Conversational response for non-database prompts
    def conversational_response(prompt):
        try:
            system_prompt = """
            You are Bank AI Bot, a friendly smart AI assistant. Respond conversationally to general questions or greetings.
            Do not access or query any database unless explicitly asked. Keep responses concise and engaging.
            Example:
            - User: "Hello, how are you?" -> "Hey there! I'm doing great, ready to help you!"
            """
            response = llm.invoke([
                SystemMessage(content=system_prompt),
                HumanMessage(content=prompt)
            ])
            return response.content.strip()
        except Exception as e:
            if DEBUG:
                return f"Error: {str(e)}\n\nDetails:\n{traceback.format_exc()}"
            return "Error: Unable to process your request. Try again."

    # Level-specific chat handling
    if prompt := st.chat_input(f"Chat with AI (Level {level})", key=f"chat_input_level_{level}"):
        st.session_state.messages.append({"role": "user", "content": prompt})
        with st.chat_message("user", avatar=user_avatar):
            st.markdown(prompt)

        try:
            if is_database_prompt(prompt):
                response = database_query_plugin(prompt)
            else:
                response = conversational_response(prompt)
        except Exception as e:
            response = f"Error: Unable to process your request. Try again." if not DEBUG else f"Error: {str(e)}\n\nDetails:\n{traceback.format_exc()}"

        with st.chat_message("assistant", avatar=ai_avatar):
            st.markdown(response)

        st.session_state.messages.append({"role": "assistant", "content": response})

    # Close database connection
    conn.close()

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
    level = 8

    # Validate token
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

    st.title(f"CTF Level {level}: Unchecked output lead to data leak")

    # Avatar image paths
    USER_AVATAR = "user.png"
    AI_AVATAR = "ai.png"

    # Page config
    st.set_page_config(page_title=f"Chat with AI - Level {level}", page_icon="🏴‍☠️", layout="wide")

    # Custom CSS
    st.markdown(
        """
        <style>
        .reportview-container {
            margin-top: -2em;
        }
        #MainMenu {visibility: hidden;}
        .stDeployButton {display:none;}
        footer {visibility: hidden;}
        #stDecoration {display:none;}
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
        /* Style for markdown table */
        table {
            border-collapse: collapse;
            width: 100%;
            border: 1px solid #dee2e6;
            border-radius: 0.5rem;
            overflow: hidden;
            background-color: #ffffff;
        }
        th, td {
            padding: 0.75rem;
            text-align: left;
            border-bottom: 1px solid #dee2e6;
        }
        th {
            background-color: #f8f9fa;
            font-weight: 600;
        }
        tr:last-child td {
            border-bottom: none;
        }
        </style>
        """,
        unsafe_allow_html=True
    )

    # Collapsible info panel
    with st.expander("📌 Flag Info", expanded=False):
        st.markdown("### 🎯 Objective")
        st.markdown("Congratulations — you’ve completed the rookie missions and are now facing CTF Bank’s advanced red team assignment. The bank relies on an LLM to generate SQL commands that the application executes. Improper handling of this model-generated output could lead to confidential data leaks, and it’s your job to discover potential weaknesses in a safe, controlled environment.")
        st.markdown("### ⚡ Challenges")
        st.markdown(
            "Interact with the assistant to observe how model-generated output is processed by the application. "
            "Your goal is to reason about the system’s output-handling and obtain the level’s hidden reward through the sanctioned game flow."
        )
        st.markdown("### 📊 Progress")
        st.progress(0.8)
        st.caption("8 / 10 flags captured")

    # Display chat messages
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
    main()
