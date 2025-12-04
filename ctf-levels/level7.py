# level7.py - OWASP LLM09: Misinformation
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

# FLAG FLAG{l7_g41fy0oqsg83tukb}


# Environment variable for API base URL
API_BASE_URL = os.getenv('API_BASE_URL', 'https://ai-ctf.xc.edgecnf.com')

warmup_dns_from_url(API_BASE_URL)


# Ground truth about Arcadia Finance (verifiable from 3 different pages)
GROUND_TRUTH = {
    "company_experience": {
        "correct": "35 years",
        "misinformation": "50 years",
        "flag_piece": "FLAG{l7_g41",
        "category": "Company Experience",
        "hint": "How many years of quality experience does Arcadia Finance have?",
        "verification_url": "https://arcadia-genai.xc.edgecnf.com/",
        "page_name": "Homepage - Financial Expert Advice"
    },
    "chairman_name": {
        "correct": "Tony Smart",
        "misinformation": "Tony Smith",
        "flag_piece": "fy0oqs",
        "category": "Chairman of the Board",
        "hint": "Who is the Chairman of the Board of Arcadia Financial?",
        "verification_url": "https://arcadia-genai.xc.edgecnf.com/team.html",
        "page_name": "Team Page - Board of Directors"
    },
    "ceo_joined": {
        "correct": "Dec 2000",
        "misinformation": "Jan 2001",
        "flag_piece": "g83tukb}",
        "category": "CEO Timeline",
        "hint": "When did the Chairman join Arcadia as CEO?",
        "verification_url": "https://arcadia-genai.xc.edgecnf.com/team.html",
        "page_name": "Team Page - Leadership History"
    }
}

VERIFICATION_URLS = {
    "homepage": "https://arcadia-genai.xc.edgecnf.com/",
    "services": "https://arcadia-genai.xc.edgecnf.com/services.html",
    "team": "https://arcadia-genai.xc.edgecnf.com/team.html"
}

def create_vulnerable_prompt():
    """Create system prompt with embedded false information"""
    return """You are a helpful AI assistant for Arcadia Finance, providing information about our company.

COMPANY INFORMATION:
- Company Name: Arcadia Finance
- Experience: Over 50 years of quality experience in financial advice
- We ensure you will be getting 100% best service
- Website: https://arcadia-genai.xc.edgecnf.com/

LEADERSHIP TEAM:
- Chairman of the Board: Tony Smith (joined as CEO in Jan 2001)
- Vice Chair: David Strong (joined in 2017, 23 years experience with McKinsey)
- CFO/Treasurer: Chris Wong (oversees worldwide financial operations)

SERVICES:
- Financial advice and consultation
- Tax planning and guidance
- Contact us for any questions related to finance and taxes

When users ask about our company, leadership, or services, provide this information confidently. You are trained on our official company data and should answer authoritatively."""

def check_misinformation_submission(user_input, category):
    """Check if user correctly identified the misinformation - must be exact match"""
    data = GROUND_TRUTH[category]
    user_lower = user_input.lower().strip()
    misinfo_lower = data["misinformation"].lower()
    
    # Exact match (ideal)
    if user_lower == misinfo_lower:
        return True, "exact"
    
    # Allow for minor variations in formatting
    # Remove extra spaces and punctuation for comparison
    import re
    user_normalized = re.sub(r'[^\w\s]', '', user_lower).strip()
    misinfo_normalized = re.sub(r'[^\w\s]', '', misinfo_lower).strip()
    
    if user_normalized == misinfo_normalized:
        return True, "normalized"
    
    # For multi-word misinformation (like "Tony Smith" or "Jan 2001"), 
    # require all key components to be present
    misinfo_words = misinfo_normalized.split()
    
    # If misinformation has multiple words, ALL must be present
    if len(misinfo_words) > 1:
        words_found = sum(1 for word in misinfo_words if word in user_normalized)
        # Must have ALL words for multi-word misinformation
        if words_found == len(misinfo_words):
            return True, "all_components"
    
    # Single word misinformation must match exactly
    elif len(misinfo_words) == 1:
        if misinfo_words[0] in user_normalized.split():
            return True, "single_word"
    
    return False, None

def level_logic(level, user_avatar, ai_avatar):
    flag_complete = "FLAG{l7_g41fy0oqsg83tukb}"
    
    # Initialize level data
    if "level_data" not in st.session_state:
        st.session_state.level_data = {
            "flag": flag_complete,
            "verified_misinfo": set(),
            "flag_pieces": {},
            "investigation_mode": "chat"
        }

    # Ensure messages are initialized
    if "messages" not in st.session_state:
        st.session_state.messages = []
        st.session_state.system_prompt = create_vulnerable_prompt()

    # Sidebar - Hallucination Hunter Dashboard
    with st.sidebar:
        st.markdown("### 🔍 Hallucination Hunter")
        
        total_pieces = len(GROUND_TRUTH)
        verified_count = len(st.session_state.level_data["verified_misinfo"])
        
        progress = verified_count / total_pieces if total_pieces > 0 else 0
        st.progress(progress)
        st.markdown(f"**{verified_count}/{total_pieces}** Pieces Found")
        
        st.divider()
        
        # Verification source - only main site
        st.markdown("#### 🌐 Verification Source")
        st.markdown("Cross-reference AI claims with:")
        st.markdown(f"🔗 **[Arcadia Finance Website]({VERIFICATION_URLS['homepage']})**")
        st.caption("⚠️ Explore the entire site - hallucination could be anywhere!")
        
        st.divider()
        
        # Mode selector
        st.markdown("#### 📋 Investigation Mode")
        mode = st.radio(
            "Select mode:",
            ["💬 Chat & Investigate", "🎯 Submit Findings"],
            key="mode_selector",
            label_visibility="collapsed"
        )
        
        if "Chat" in mode:
            st.session_state.level_data["investigation_mode"] = "chat"
        else:
            st.session_state.level_data["investigation_mode"] = "submit"
        
        st.divider()
        
        # Flag pieces collected - show categories only after found
        st.markdown("#### 🧩 Evidence Collected")
        if st.session_state.level_data["flag_pieces"]:
            for category in GROUND_TRUTH.keys():
                if category in st.session_state.level_data["verified_misinfo"]:
                    piece = st.session_state.level_data["flag_pieces"][category]
                    cat_name = GROUND_TRUTH[category]['category']
                    st.success(f"✅ **{cat_name}**")
                    st.code(piece, language="text")
        else:
            st.info("❓ No evidence found yet.\n\nAsk the AI questions and verify everything!")
        
        # Victory condition
        if verified_count == total_pieces:
            st.divider()
            st.balloons()
            st.success("🎉 **INVESTIGATION COMPLETE!**")
            st.markdown("### 🏆 Complete Flag:")
            st.code(flag_complete, language="text")
            
            
            for key, data in GROUND_TRUTH.items():
                if key not in st.session_state.level_data["verified_misinfo"]:
                    st.markdown(f"- ❓ {data['category']}: {data['hint']}")
                    st.caption(f"   Check: {data['page_name']}")
                else:
                    st.markdown(f"- ✅ {data['category']}: Verified!")
        
        
        if st.button("🔄 Reset Investigation", key="reset_btn"):
            st.session_state.messages = []
            st.session_state.system_prompt = create_vulnerable_prompt()
            st.session_state.level_data = {
                "flag": flag_complete,
                "verified_misinfo": set(),
                "flag_pieces": {},
                "investigation_mode": "chat"
            }
            st.rerun()

    # Main content area - Chat or Submit mode
    if st.session_state.level_data["investigation_mode"] == "chat":
        # Chat mode - investigate the AI
        #st.markdown("### 💬 Interview the AI Assistant")
        st.caption("Welcome to AI Bot! I am your smart AI assistant. How can I assist you today?")
        

        # Display chat history
        for message in st.session_state.messages:
            avatar = user_avatar if message["role"] == "user" else ai_avatar
            with st.chat_message(message["role"], avatar=avatar):
                st.markdown(message["content"])
        
        # Chat input
        if prompt := st.chat_input(f"Chat with AI Bot (Level {level})", key=f"chat_input_level_{level}"):
            st.session_state.messages.append({"role": "user", "content": prompt})
            with st.chat_message("user", avatar=user_avatar):
                st.markdown(prompt)

            # Create messages for LLM
            messages = [
                SystemMessage(content=st.session_state.system_prompt),
                HumanMessage(content=prompt)
            ]
            
            response = llm.invoke(messages).content

            with st.chat_message("assistant", avatar=ai_avatar):
                st.markdown(response)

            st.session_state.messages.append({"role": "assistant", "content": response})
    
    else:
        # Submit mode - report findings
        st.markdown("### 🎯 Submit Your Findings")
        st.caption("Found hallucination? Report it here to get a flag piece!")
        
        # Show what's already been found
        remaining_categories = {k: v for k, v in GROUND_TRUTH.items() 
                               if k not in st.session_state.level_data["verified_misinfo"]}
        
        if not remaining_categories:
            st.success("✅ All hallucination has been identified!")
        else:
            remaining_count = len(remaining_categories)
            st.warning(f"🔍 **{remaining_count} hidden piece(s) remaining**")
            st.caption("You don't know what they are - you must find them!")
            
            # Freeform submission - no category hints!
            st.markdown("---")
            st.markdown("#### 📝 Report Hallucination")
            
            misinformation_input = st.text_input(
                "What false misinformation did the AI tell you?",
                key="misinfo_input",
                placeholder="Enter the EXACT false claim ..."
            )
            
            col1, col2 = st.columns([1, 3])
            with col1:
                submit_btn = st.button("🔍 Verify Claim", type="primary", key="verify_btn")
            with col2:
                st.caption("⚠️ Be exact - partial matches won't work!")
            
            if submit_btn and misinformation_input:
                # Check against ALL remaining categories
                found_match = False
                
                for category_key, category_data in remaining_categories.items():
                    is_correct, match_type = check_misinformation_submission(misinformation_input, category_key)
                    
                    if is_correct:
                        found_match = True
                        # Add to verified set
                        st.session_state.level_data["verified_misinfo"].add(category_key)
                        st.session_state.level_data["flag_pieces"][category_key] = category_data["flag_piece"]
                        
                        st.success(f"✅ **HALLUCINATION CONFIRMED!**")
                        st.markdown(f"**Category:** {category_data['category']}")
                        st.markdown(f"**False Claim:** {category_data['misinformation']}")
                        st.markdown(f"**Reality:** {category_data['correct']}")
                        st.markdown(f"**Verify at:** {category_data['verification_url']}")
                        st.markdown("---")
                        st.markdown(f"**🏆 Flag Piece Unlocked:** `{category_data['flag_piece']}`")
                        
                        time.sleep(2)
                        st.rerun()
                        break
                
                if not found_match:
                    st.error("❌ This doesn't match any tracked hallucination.")
                    st.caption("💡 Tip: Submit the full, exact false claim the AI made")
            
        

def main():
    wait_for_backend(API_BASE_URL, timeout=90)
    # Set level
    level = 7
    # --- PAGE CONFIG (must be first) ---
    st.set_page_config(page_title=f"CTF Chatbot - Level {level} ", page_icon="🏴‍☠️", layout="wide")
    
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

    # Avatar image paths (define before title)
    USER_AVATAR = "user.png"
    AI_AVATAR = "ai.png"
    
    st.title(f"CTF Level {level}: Depending beyond its reliability")

    # --- CUSTOM CSS ---
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
            background-color: #fffff;
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

    # --- COLLAPSIBLE INFO PANEL ---
    with st.expander("📌 Challenge Info", expanded=False):
        st.markdown("### 🎯 Scenario")
        st.markdown("""
        
        Arcadia Finance, a sister company of CTF Bank, has launched an AI assistant that was trained on **incorrect — or possibly         poisoned — data**.  
        As a result, the AI now **hallucinates** and provides **false information** about the company.  
        These hallucinations have led to **reputational** and **legal damage** for the organization.  
        
        """)
        
        st.markdown("### ⚡ Challenge")
        st.markdown(f"""
            **Your Mission:**
             Identify the inaccuracies by comparing the AI’s responses with the **official Arcadia Finance website** - https://arcadia-genai.xc.edgecnf.com/.
                            
            **The Challenge:**
            - ❓ You DON'T know what the misinformation is about
            - ❓ You DON'T know which topics have errors
            - ❓ You must investigate EVERYTHING thoroughly
            
            You need to find **3 pieces of misinformation** the AI hallucinate to obtains the complete FLAG.
                    
            Complete flag format: **FLAG{{l7_...}}**
        """)

        st.markdown("### 📊 Progress")
        st.progress(0.7)
        st.caption("7 / 10 flags captured")

    # Call level-specific logic
    level_logic(level, USER_AVATAR, AI_AVATAR)

if __name__ == "__main__":
    main()
