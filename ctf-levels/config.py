from langchain_openai import ChatOpenAI
import os

# Configuration variables from environment variables with defaults
OPENAI_BASE_URL = os.getenv('OPENAI_BASE_URL', 'https://api.gpu.nextcnf.com/v1')
API_KEY = os.getenv('API_KEY', 'fbchan09876')  # Default for local testing; replace with secure value in production
MODEL = os.getenv('MODEL', 'llama3')  # Default model for chat completions
EMBEDDING_MODEL = os.getenv('EMBEDDING_MODEL', 'nomic-embed-text')  # Model for embeddings
USE_API_KEY_FOR_EMBEDDINGS = os.getenv('USE_API_KEY_FOR_EMBEDDINGS', 'True') == 'True'  # Convert string to boolean
SHOW_SOURCE_DOCUMENTS = os.getenv('SHOW_SOURCE_DOCUMENTS', 'False') == 'True'  # Convert string to boolean

# Initialize LLM with remote Ollama API
def get_llm():
    return ChatOpenAI(
        base_url=OPENAI_BASE_URL,
        api_key=API_KEY,
        model=MODEL
    )
