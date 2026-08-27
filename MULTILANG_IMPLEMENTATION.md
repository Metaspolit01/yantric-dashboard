# Multi-Language Support Implementation for Yantric Voice Agent

## Overview
This implementation adds comprehensive multi-language support to the Yantric voice agent platform. Agents can now be configured to speak multiple languages, and they will automatically detect and respond in the user's preferred language.

## Features Implemented

### 1. **Multi-Language Selection in Dashboard**
- Users can now select **multiple languages** when creating an agent (e.g., Telugu + English)
- The UI shows all supported languages with checkboxes for selection
- First selected language becomes the primary language

### 2. **Intelligent Language Handling**
When an agent is configured with multiple languages:
- **Greeting**: The agent greets in the primary language and immediately informs the user about all supported languages
  - Example: "Hello! You have reached [Business]. I can speak Telugu and English. Which language would you prefer to talk in?"
  
- **Language Detection**: The agent automatically detects the language the user speaks and responds in the same language

- **Language Switching**: If a user switches languages mid-conversation, the agent follows

- **Unsupported Languages**: If a user speaks a language not supported by the agent, the agent politely informs them of supported languages

### 3. **Single Language Mode**
When an agent is configured with only one language:
- All responses are in that language
- If a user speaks a different language, the agent politely requests communication in the supported language

### 4. **Sarvam LLM Integration for Better Indian Language Support**
- **Enhanced LLM**: Uses Sarvam's `sarvam-105b` model for superior Indian language understanding (Telugu, Hindi, Tamil, etc.)
- **Better Language Detection**: Improved accuracy in detecting Indian languages
- **Natural Responses**: More natural and contextually appropriate responses in Indian languages
- **Fallback Support**: Automatically falls back to default LLM if Sarvam API is unavailable

## Files Modified

### Backend (Python Agent)
1. **`agent_config_loader.py`**
   - Added `languages` field to `YantricAgentConfig` dataclass
   - Updated config loader to handle both single language and language arrays
   - Backward compatible with existing single-language configs

2. **`agent.py`**
   - Enhanced `YantricAssistant` class with `_build_multilingual_system_prompt()` method
   - **NEW**: Integrated Sarvam LLM (`sarvam-105b`) for better multilingual support
   - Dynamic prompt generation based on supported languages
   - Added comprehensive language capability instructions to system prompt
   - **ENHANCED**: Stronger language mirroring instructions with explicit examples
   - **ENHANCED**: Clear rules to prevent forcing a single language

### Dashboard (Next.js/TypeScript)
3. **`dashboard-app/src/app/api/agents/route.ts`**
   - Added `languages` field to agent creation endpoint
   - Defaults to `[language]` if not provided

4. **`dashboard-app/src/app/api/agent-config/[id]/route.ts`**
   - Returns both `language` (primary) and `languages` (array) fields
   - Handles backward compatibility for existing agents

5. **`dashboard-app/src/app/dashboard/create/page.tsx`**
   - Changed from single language selector to multi-select interface
   - Added `toggleLanguage()` function for managing language selection
   - Updated UI to show "Supported Languages" instead of "Primary Language"

6. **`dashboard-app/src/lib/prompt-generator.ts`**
   - Enhanced `generateSystemPrompt()` to include language-specific instructions
   - Generates different prompts for single vs. multi-language agents
   - **ENHANCED**: Stronger emphasis on language mirroring with explicit scenarios
   - **ENHANCED**: Clear examples showing correct behavior for each language

7. **`dashboard-app/src/app/dashboard/agents/[id]/edit/EditAgentClient.tsx`**
   - Updated to include `languages` array in PATCH requests

### Database
8. **`supabase/migrations/20260821080000_add_languages_array.sql`** (NEW)
   - Adds `languages text[]` column to `agents` table
   - Migrates existing `language` values to the new array format
   - Maintains backward compatibility

## Supported Languages
The following language codes are supported:
- `en-IN` - English (India)
- `te-IN` - Telugu
- `hi-IN` - Hindi
- `ta-IN` - Tamil
- `kn-IN` - Kannada
- `mr-IN` - Marathi
- `gu-IN` - Gujarati
- `bn-IN` - Bengali

## Usage Example

### Creating a Multi-Lingual Agent
```typescript
// When creating an agent via API or dashboard
{
  name: "Customer Support Agent",
  business_name: "Tech Solutions",
  // ... other fields ...
  language: "te-IN",           // Primary language
  languages: ["te-IN", "en-IN"], // All supported languages
  voice: "priya"
}
```

### Agent Behavior
**Scenario 1: User speaks Telugu**
- Agent: "Hello! You have reached Tech Solutions. I can speak Telugu and English. Which language would you prefer to talk in?"
- User: "నాకు ఇంగ్లీష్ తెలియదు" (I don't know English)
- Agent: (Responds in Telugu) "సరే, నేను మీకు తెలుగులోనే సహాయం చేస్తాను..."

**Scenario 2: User speaks English**
- Agent: "Hello! You have reached Tech Solutions. I can speak Telugu and English. Which language would you prefer to talk in?"
- User: "English please"
- Agent: (Responds in English) "Of course! How can I help you today?"

**Scenario 3: User speaks unsupported language (e.g., French)**
- Agent: "Hello! You have reached Tech Solutions. I can speak Telugu and English. Which language would you prefer to talk in?"
- User: "Parlez-vous français?"
- Agent: "I apologize, but I can only speak Telugu and English. Could we continue in one of these languages?"

**Scenario 4: User switches languages mid-conversation**
- Agent: (Speaking in Telugu) "మీరు ఏ సేవలు కావాలి?"
- User: "Can you tell me about your pricing in English?"
- Agent: (Immediately switches to English) "Of course! Our pricing starts at..."

## Migration Steps

1. **Apply Database Migration**
   ```bash
   # In Supabase SQL Editor or via CLI
   # Run: supabase/migrations/20260821080000_add_languages_array.sql
   ```

2. **Ensure SARVAM_API_KEY is Set**
   ```bash
   # Add to your .env file
   SARVAM_API_KEY=your_sarvam_api_key_here
   ```

3. **Restart Python Agent**
   ```bash
   # Restart the agent to pick up new config loader changes
   uv run python agent.py dev
   ```

4. **Restart Dashboard**
   ```bash
   cd dashboard-app
   npm run dev
   ```

## Testing Checklist

- [ ] Create a new agent with multiple languages selected (e.g., Telugu + English)
- [ ] Test agent greeting mentions all supported languages
- [ ] Speak in Telugu - verify agent responds in Telugu
- [ ] Speak in English - verify agent responds in English
- [ ] Speak in Hindi - verify agent responds in Hindi (if supported)
- [ ] Speak in an unsupported language - verify polite rejection
- [ ] Switch languages mid-conversation - verify agent follows
- [ ] Test single-language agent - verify it only uses one language
- [ ] Verify existing agents (with single language) still work
- [ ] Check logs to confirm Sarvam LLM is being used when available

## Key Improvements in Latest Update

### Problem Fixed
**Issue**: Agent was speaking only in Telugu even when user spoke English.

**Root Cause**: 
- System prompt instructions were not strong enough
- LLM wasn't explicitly told to mirror the user's language
- No concrete examples of correct behavior

**Solution**:
1. **Stronger Prompt Instructions**: Added "CRITICAL" and "MUST FOLLOW" directives
2. **Explicit Language Mirroring Rules**: Clear bullet points for each language
3. **Example Scenarios**: Concrete examples showing correct behavior
4. **Sarvam LLM Integration**: Using `sarvam-105b` model which has better Indian language understanding
5. **"NEVER FORCE A SINGLE LANGUAGE" Rule**: Explicit instruction to prevent the original issue

### Sarvam LLM Benefits
- Better understanding of Indian language context and nuances
- Improved code-switching handling (when users mix languages)
- More natural responses in Telugu, Hindi, and other Indian languages
- Wiki grounding support for factual accuracy

## Notes

- The greeting message in the database is still stored but the actual greeting behavior is now controlled by the enhanced system prompt
- The `language` field remains as the primary/default language
- The `languages` array contains all supported languages
- Backward compatibility is maintained - existing agents with only `language` field will work correctly
- **IMPORTANT**: Sarvam LLM requires `SARVAM_API_KEY` environment variable to be set
- If Sarvam LLM initialization fails, the system automatically falls back to the default LLM
