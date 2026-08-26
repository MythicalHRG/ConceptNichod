import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';

export const ai = genkit({
  // Setting apiKey to false tells the plugin to expect an apiKey in the config at call time.
  plugins: [googleAI({apiKey: false})],
});
