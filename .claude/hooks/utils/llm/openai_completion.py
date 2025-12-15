#!/usr/bin/env python3
"""
OpenAI LLM utility for generating completion messages.
Generates short, friendly, varied completion messages using OpenAI's API.
"""

import os
import sys
from openai import OpenAI

def generate_completion_message():
    """Generate a short, friendly completion message using OpenAI."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None

    try:
        client = OpenAI(api_key=api_key)

        # Get optional engineer name for personalization
        engineer_name = os.getenv("ENGINEER_NAME", "")

        # Build the prompt
        prompt = """Generate a short, friendly completion message (under 10 words) that is positive and future focused.

Examples:
- "Ready for the next challenge!"
- "All set! What's next?"
- "Task complete! Ready when you are."
- "Done and dusted! Let's keep going."
- "Nailed it! On to the next one."
"""

        if engineer_name:
            prompt += f"\n\nPersonalize it for {engineer_name}."

        # Call OpenAI API with fast, cheap model
        response = client.chat.completions.create(
            model="gpt-4o-mini",  # Fast and cost-effective
            messages=[
                {"role": "user", "content": prompt}
            ],
            max_tokens=50,
            temperature=0.7
        )

        message = response.choices[0].message.content.strip()
        # Remove quotes if present
        message = message.strip('"').strip("'")
        return message

    except Exception as e:
        print(f"OpenAI completion error: {e}", file=sys.stderr)
        return None

if __name__ == "__main__":
    message = generate_completion_message()
    if message:
        print(message)
        sys.exit(0)
    else:
        sys.exit(1)
