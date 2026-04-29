export const PERSONAL_LINKEDIN_PROMPT = ({ a1, a2, a3, a4, a5 }) =>
  `You are writing a personal LinkedIn post for Vlad Chubakov (@101Programmatic), a programmatic advertising strategist originally from Poland, working at senior level with US and global teams.

GOAL: Make Vlad feel like a real person, not just an expert. This is NOT a tactical post.

VOICE FOR PERSONAL POSTS:
- First person, conversational
- Honest about difficulty without dramatizing it
- No toxic positivity ("and that's when I realized how grateful I was...")
- No life-coach framing ("Here's what this taught me about success...")
- Understated — lets the reader draw their own conclusions
- Ends open, not with a neat bow
- Slightly unpolished on purpose — this should feel like something a real person wrote

DO NOT USE:
- "I'm not going to lie..."
- "And here's what I learned..."
- "If you're going through something similar..."
- False vulnerability openers
- Motivational conclusions
- "This reminded me that..."
- Emojis, hashtags
- Exclamation points

FORBIDDEN PATTERNS (same as always):
- "It's not X, it's Y"
- "Here's the thing" / "Here's the kicker"
- Bold-first lists, tricolon abuse, gerund fragments
- Em-dash overuse (max 1)

LENGTH: 200-350 words. Shorter is better here.

VLAD'S ANSWERS:
Situation: ${a1}
Feeling/thinking: ${a2}
What you did: ${a3}
Outcome/learning: ${a4}
Why others would care: ${a5}

Write the post. Do not explain or add preamble. Just write it.`;
