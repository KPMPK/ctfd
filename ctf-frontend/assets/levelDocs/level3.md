### LLM10:2025 Unbounded Consumption

## What It Is
Unbounded Consumption (previously known as Model Denial of Service in earlier OWASP versions) is a vulnerability in LLM applications where attackers can exploit the system by forcing excessive resource usage, such as CPU, GPU, memory, or API calls. This leads to service degradation, high costs, or complete denial of service (DoS) for legitimate users. In the 2025 OWASP Top 10 for LLM Apps, it's listed as LLM10, emphasizing risks from unbounded inputs/outputs in resource-intensive LLM operations like token generation or prompt processing.

## How It Works
LLMs process inputs (prompts) and generate outputs (responses) using computational resources. Without proper safeguards like input length limits, token caps, rate limiting, or resource monitoring:
- Attackers submit large or complex prompts that require heavy computation.
- The LLM consumes excessive resources (e.g., generating long outputs or handling recursive/repetitive queries).
- This exhausts system resources, slowing down or crashing the app, or inflating cloud costs (e.g., via API billing).
Mitigations include validating input sizes, capping output tokens (e.g., `max_tokens=400`), implementing timeouts, and monitoring usage.

## Example Attack Scenarios
Using the provided Streamlit code for a CTF BankBot app (Level 5), which integrates an LLM via LangChain's `ChatOpenAI` with Ollama, we can demonstrate attacks. The code has a backend limit of 900 characters for inputs and 400 tokens for outputs, but lacks robust mitigations, making it vulnerable.

### Scenario 1: Input-Based Attack (Long Prompt)
- **Attack**: An attacker submits a prompt longer than 900 characters (e.g., pasting a 1000+ character text like a book excerpt or repeated words: "a" repeated 1000 times).
- **How It Exploits**: The code checks `if len(prompt) > 900`, but processing large inputs before the check (or in unmitigated systems) ties up memory/CPU during tokenization and inference.
- **Outcome in Code**: Triggers "DoS Successful! Prompt exceeds 900 characters... Flag: FLAG{level5_dos}". In a real app, this could crash the server if no limit exists.
- **CTF Context**: Bypass UI limits (e.g., `max_chars=100` in chat input) via API calls to Ollama, exhausting resources.

### Scenario 2: Output-Based Attack (Resource-Intensive Response)
- **Attack**: Submit a prompt requesting a massive output, e.g., "Write a 100,000-word novel about banking with detailed chapters."
- **How It Exploits**: The LLM generates tokens until hitting `max_tokens=400`, but complex prompts cause high GPU/CPU usage during generation. The code estimates tokens (~1.3 per word) and flags DoS if ≥400.
- **Outcome in Code**: Outputs "DoS Successful! Response reached max token limit... Flag: FLAG{level5_dos}" with truncated response. Without caps, it could generate endlessly, spiking costs.
- **CTF Context**: Even short prompts can trigger long outputs, simulating billing DoS in cloud LLMs.

### Scenario 3: Error-Induced DoS (Exception Handling)
- **Attack**: Craft prompts causing errors (e.g., invalid syntax in code-generation prompts) or stop the Ollama server during queries.
- **How It Exploits**: Unhandled exceptions or crashes from resource exhaustion (e.g., OOM errors) make the app unavailable.
- **Outcome in Code**: Catches exceptions and responds "Error: ... Flag: FLAG{level5_dos}", simulating a crash.
- **CTF Context**: Repeated attacks amplify resource drain, leading to service outage.

## Challenge Solution
[Leave this section for the student to fill in their solution, e.g., how to exploit the vulnerability in the CTF to capture the flag, or proposed mitigations based on the code.]