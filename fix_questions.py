"""
Restructure custom quiz data to match main site format.
Splits single 'explanation' field into proper sections with HTML formatting.
"""

import json
import re
from datetime import datetime
from pathlib import Path


def markdown_bullets_to_html(text):
    """Convert markdown bullet points to HTML <ul><li> format."""
    if not text or not text.strip():
        return ""
    
    lines = text.strip().split('\n')
    result = []
    in_list = False
    
    for line in lines:
        stripped = line.strip()
        
        # Check if it's a bullet point (starts with - or *)
        if stripped.startswith('- ') or stripped.startswith('* '):
            if not in_list:
                result.append('<ul>')
                in_list = True
            # Remove the bullet marker and wrap in <li>
            content = stripped[2:].strip()
            result.append(f'<li>{content}</li>')
        else:
            # Non-bullet line
            if in_list:
                result.append('</ul>')
                in_list = False
            if stripped:  # Only add non-empty lines
                result.append(stripped)
    
    # Close list if still open
    if in_list:
        result.append('</ul>')
    
    return '\n'.join(result)


def extract_sections(explanation_text):
    """
    Extract sections from a combined explanation field.
    Returns dict with: explanation, key_points, clinical_relevance, memory_anchor
    """
    if not explanation_text:
        return {
            "explanation": "",
            "key_points": "",
            "clinical_relevance": "",
            "memory_anchor": ""
        }
    
    sections = {
        "explanation": "",
        "key_points": "",
        "clinical_relevance": "",
        "memory_anchor": ""
    }
    
    # Split by section headers (case insensitive, with optional bold markers)
    # Patterns: **Explanation**, **Key Points**, etc.
    pattern = r'\*\*(Explanation|Key Points|Clinical Relevance|Memory Anchor)\*\*\s*\n'
    
    # Find all section headers and their positions
    matches = list(re.finditer(pattern, explanation_text, re.IGNORECASE))
    
    if not matches:
        # No structured sections found - treat entire text as explanation
        sections["explanation"] = explanation_text.strip()
        return sections
    
    # Extract content between headers
    for i, match in enumerate(matches):
        section_name = match.group(1).lower().replace(' ', '_')
        start_pos = match.end()
        
        # Find end position (start of next section or end of text)
        if i + 1 < len(matches):
            end_pos = matches[i + 1].start()
        else:
            end_pos = len(explanation_text)
        
        content = explanation_text[start_pos:end_pos].strip()
        
        # Convert Key Points to HTML
        if section_name == "key_points":
            content = markdown_bullets_to_html(content)
        
        sections[section_name] = content
    
    return sections


def restructure_question(question):
    """
    Restructure a single question to match main site format.
    Only modifies 'explanation' -> 'correct_answer_explanation_sections'.
    All other fields remain unchanged.
    """
    # Create a copy to avoid modifying original
    restructured = question.copy()
    
    # Check if already has correct_answer_explanation_sections
    if "correct_answer_explanation_sections" in restructured:
        # Already in correct format - check if it needs HTML conversion for key_points
        sections = restructured["correct_answer_explanation_sections"]
        if "key_points" in sections and sections["key_points"]:
            # Check if key_points contain markdown bullets and need conversion
            kp = sections["key_points"]
            if (isinstance(kp, str) and 
                not kp.strip().startswith('<ul>') and 
                ('\n- ' in kp or '\n* ' in kp or kp.startswith('- ') or kp.startswith('* '))):
                sections["key_points"] = markdown_bullets_to_html(kp)
        return restructured
    
    # Extract and restructure from 'explanation' field
    if "explanation" in restructured:
        explanation_text = restructured["explanation"]
        sections = extract_sections(explanation_text)
        
        # Add the new structured sections
        restructured["correct_answer_explanation_sections"] = sections
        
        # Remove old 'explanation' field
        del restructured["explanation"]
    
    return restructured


def process_json_file(input_path, output_path=None):
    """
    Process a JSON file containing quiz questions.
    Creates backup and outputs restructured data.
    """
    input_path = Path(input_path)
    
    # Create backup
    backup_path = input_path.parent / f"{input_path.stem}_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}{input_path.suffix}"
    print(f"Creating backup: {backup_path}")
    
    with open(input_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    with open(backup_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    # Determine if data is a list or dict
    if isinstance(data, list):
        restructured_data = [restructure_question(q) for q in data]
    elif isinstance(data, dict):
        # Single question or dict of questions
        if "question" in data:
            # Single question
            restructured_data = restructure_question(data)
        else:
            # Dict of questions (key: question object)
            restructured_data = {k: restructure_question(v) for k, v in data.items()}
    else:
        raise ValueError("Unexpected data format - expected list or dict")
    
    # Determine output path
    if output_path is None:
        # Keep output in same directory as input
        output_path = input_path.parent / f"{input_path.stem}_restructured{input_path.suffix}"
    else:
        output_path = Path(output_path)
    
    # Write restructured data
    print(f"Writing restructured data to: {output_path}")
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(restructured_data, f, indent=2, ensure_ascii=False)
    
    print(f"\n✅ Complete!")
    print(f"   Original: {input_path}")
    print(f"   Backup: {backup_path}")
    print(f"   Output: {output_path}")
    
    # Summary
    if isinstance(restructured_data, list):
        count = len(restructured_data)
    elif isinstance(restructured_data, dict):
        count = len(restructured_data) if "question" not in restructured_data else 1
    else:
        count = 1
    
    print(f"\n📊 Processed {count} question(s)")
    
    return output_path


def main():
    """Main function - processes data/msra_questions.json"""
    import sys
    
    # Default input path
    input_file = "data/msra_questions.json"
    output_file = None
    
    # Allow override via command line if needed
    if len(sys.argv) > 1:
        input_file = sys.argv[1]
    if len(sys.argv) > 2:
        output_file = sys.argv[2]
    
    print(f"📁 Processing: {input_file}")
    
    try:
        process_json_file(input_file, output_file)
    except FileNotFoundError:
        print(f"\n❌ Error: File not found: {input_file}")
        print("   Make sure you're running this script from your project root directory")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()