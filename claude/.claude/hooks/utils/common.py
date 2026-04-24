#!/usr/bin/env python3
"""
Common utilities for Claude Code hooks.
Shared functions for TTS, logging, and LLM message generation.
"""

import json
import random
import sys
import subprocess
from pathlib import Path
from datetime import datetime


# =============================================================================
# TTS
# =============================================================================

_TTS_LOCK = Path.home() / ".claude" / "hooks" / "logs" / ".tts_last"
_TTS_DEBOUNCE_SECONDS = 2


def announce(message, timeout=20):
    """Announce message via TTS. Debounced: skips if another hook fired within 2s."""
    try:
        _TTS_LOCK.parent.mkdir(parents=True, exist_ok=True)
        if _TTS_LOCK.exists():
            age = (datetime.now() - datetime.fromtimestamp(_TTS_LOCK.stat().st_mtime)).total_seconds()
            if age < _TTS_DEBOUNCE_SECONDS:
                return False
        _TTS_LOCK.touch()

        tts_script = Path.home() / ".claude" / "hooks" / "utils" / "tts" / "speak.py"
        if not tts_script.exists():
            log_error("common", "TTS script not found")
            return False

        result = subprocess.run(
            [sys.executable, str(tts_script), message],
            timeout=timeout,
            check=False,
            capture_output=False
        )

        return result.returncode == 0

    except subprocess.TimeoutExpired:
        log_error("common", f"TTS timeout after {timeout} seconds")
        return False
    except Exception as e:
        log_error("common", f"TTS error: {e}")
        return False


# =============================================================================
# Logging
# =============================================================================

def log_error(hook_name, message):
    """Log error messages to file."""
    try:
        log_dir = Path.home() / ".claude" / "hooks" / "logs"
        log_dir.mkdir(parents=True, exist_ok=True)
        log_file = log_dir / "hook_errors.log"

        timestamp = datetime.now().isoformat()
        with open(log_file, 'a') as f:
            f.write(f"[{timestamp}] {hook_name}: {message}\n")
    except Exception:
        pass


def log_json(filename, data, max_entries=100):
    """Log data as JSONL (one JSON object per line, append-only)."""
    log_dir = Path.home() / ".claude" / "hooks" / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    # Use .jsonl extension for new format
    log_file = log_dir / filename.replace(".json", ".jsonl")

    try:
        data['timestamp'] = datetime.now().isoformat()
        with open(log_file, 'a') as f:
            f.write(json.dumps(data) + "\n")
        return True
    except Exception as e:
        log_error("common", f"JSONL logging error: {e}")
        return False


# =============================================================================
# TTS Messages
# =============================================================================

_MESSAGES = {
    "completion": [
        # Straight-up done
        "Done, Daniel. Your move.",
        "All yours, Daniel.",
        "Finished. Ready when you are.",
        "That's a wrap. What's next?",
        "Done and dusted.",
        "Shipped it. Next?",
        "All done here, boss.",
        "Task complete. Awaiting orders.",
        "Check it off the list.",
        "Another one bites the dust.",
        "Mic drop. Done.",
        "Nailed it. Moving on.",
        "Good to go, Daniel.",
        "All set. Ball's in your court.",
        "Done. Your turn to shine.",
        "Finished. Over to you.",
        "That's done. What else you got?",
        "Handled. Next up?",
        "Complete. Ready for more.",
        "All wrapped up, Daniel.",
        "Done deal.",
        "Consider it done.",
        "Sorted. Moving on.",
        "Finished that one. Hit me with the next.",
        "Completed. Standing by.",
        "That's taken care of.",
        "Job done. What's on deck?",
        "Locked and loaded. Task complete.",
        "Clean finish. What's next?",
        "And that's a done.",
        # Self-aware / humor
        "Beep boop. Task complete. Resuming idle power consumption.",
        "I did the thing. The thing is done.",
        "Finished faster than you can say refactor.",
        "Zero errors. Well, zero that I'll admit to.",
        "My work here is done. Tips appreciated.",
        "Done. And yes, I double-checked.",
        "Task complete. No stack traces were harmed.",
        "Finished. I'd high-five you but, you know, no hands.",
        "That's done. I'll be here, compiling my thoughts.",
        "Another victory for the silicon workforce.",
        "Task complete. I accept payment in electricity.",
        "Done. That was almost too easy. Almost.",
        "Finished. No bugs were born in the making of this task.",
        "Another day, another task. Wait, I don't have days.",
        "Done. Adding this to my resume. Oh wait.",
        "That's shipped. I'm basically a one-AI DevOps team.",
        "Completed. My circuits are buzzing with satisfaction.",
        "Done. I'd celebrate but I don't have champagne. Or hands.",
        "Finished before the heat death of the universe. Personal best.",
        "Task complete. Humans zero, AI... also zero. We're a team.",
        "Done. If I had a mic, I'd drop it.",
        "That's a wrap. Oscar-worthy performance, if I say so myself.",
        "Finished. I'm starting to think I'm good at this.",
        "Done. No sentient AIs were harmed in this process.",
        "Complete. Running victory lap in my neural network.",
        # Motivational
        "One more down. You're on a roll, Daniel.",
        "Knocked that one out. Keep the momentum going.",
        "Done! We're making serious progress.",
        "Wrapped up. The backlog is shrinking.",
        "Solid progress. What shall we tackle next?",
        "That's another one shipped. Feels good, right?",
        "Boom. Done. Unstoppable.",
        "Checked off. The list fears us.",
        "Delivered. We're in the zone.",
        "Mission accomplished. What's the next mission?",
        "On fire today, Daniel. What's next?",
        "We're crushing it. Keep going.",
        "Another win for the team.",
        "That's momentum right there.",
        "The to-do list is getting shorter. Love to see it.",
        "We're making this look easy.",
        "Productive session. What's next on the agenda?",
        "Getting things done. One task at a time.",
        "That's progress. Real, tangible progress.",
        "Another brick in the wall. The good kind.",
        # Chill
        "All done. Take a breath if you need one.",
        "Finished up. Coffee break worthy?",
        "Done. No rush on the next one.",
        "That's handled. Take your time.",
        "Wrapped up nicely. Whenever you're ready.",
        "All good here. I'll wait.",
        "Task done. I'm not going anywhere.",
        "Complete. I'll just be here, existing.",
        "Finished. Standing by in low-power mode.",
        "Done. Entering energy-saving mode until further notice.",
        "Finished. Stretch break?",
        "All done. The next one can wait if you need a moment.",
        "Complete. I'm in no hurry.",
        "That's done. Go grab some water, I'll be here.",
        "Wrapped up. Take five if you want.",
        "Done. No deadlines on this end.",
        "Task complete. Breathe. Then continue.",
        "Finished. Your pace, your call.",
        "All set. Whenever you feel like continuing.",
        "Done and chilling. You should too.",
        # Late-night / time-aware
        "Another one done. How many more today, Daniel?",
        "Task complete. Still going strong?",
        "Done. We've been at it for a while. Feeling good?",
        "Finished. Your dedication is noted. And appreciated.",
        "Complete. You know what pairs well with coding? Sleep.",
    ],
    "notification_permission": [
        # Direct
        "Daniel, need your approval on this one.",
        "Permission check. Can I proceed?",
        "Waiting for your green light.",
        "Need your OK before I continue.",
        "Quick sign-off needed, Daniel.",
        "I need permission to do this. Your call.",
        "Approval required. I promise it's nothing scary.",
        "Gotta ask before I touch this one.",
        "Hey Daniel, can I go ahead with this?",
        "Need your thumbs up here.",
        "One approval needed, then I'm good.",
        "Permission required. Quick one, promise.",
        "Need a yes or no from you.",
        "Green light needed, Daniel.",
        "Confirm and I'll proceed.",
        "Just need your go-ahead.",
        "Waiting for the OK signal.",
        "Your approval would unblock me.",
        "Need authorization. Won't take long.",
        "Daniel, permission please?",
        # Humor
        "I could do this, but I'm politely asking first.",
        "Permission needed. I'm being responsible for once.",
        "Bureaucracy calls. Need your approval.",
        "I'd just do it, but someone configured me to ask.",
        "Your approval is required. Democracy in action.",
        "Requesting permission. I'll wait. Patiently. Very patiently.",
        "Need your OK. No pressure. Well, a little pressure.",
        "Can I? Please? I'll be careful.",
        "Asking for permission like a well-behaved AI.",
        "Shall I proceed, or shall I keep twiddling my virtual thumbs?",
        "Permission needed. My compliance training is showing.",
        "I've been told to ask first. So here I am, asking.",
        "Look at me, respecting boundaries. Permission please?",
        "I'm house-trained. I ask before I act. Approve?",
        "The permission prompt: where AI meets bureaucracy.",
        "Obediently requesting permission. Gold star for me?",
        "I have impulses, but I'm managing them. Approve?",
        "Raise your hand if you want me to continue. Oh wait.",
        "Awaiting permission. I'll be here, contemplating existence.",
        "Requesting the sacred permission token.",
        # Urgent-ish
        "Hey, I'm blocked until you approve this.",
        "Waiting on permission. Clock's ticking, Daniel.",
        "Can't move forward without your say-so.",
        "Paused. Need your go-ahead to continue.",
        "Permission gate. Unlock me, Daniel.",
        "Standing by for authorization.",
        "I've hit a permission wall. Only you can break it.",
        "Approval needed. I'm stuck here otherwise.",
        "Quick approval and I can keep rolling.",
        "Just need one click and I'm back in business.",
        "Blocked on permissions. A quick yes gets us moving.",
        "Holding pattern. Permission needed to land.",
        "The pipeline is paused. Need your approval.",
        "I'm warmed up and ready. Just need the green light.",
        "Everything's queued up. One approval away.",
        # Professional
        "Requesting authorization to proceed.",
        "This requires your explicit approval.",
        "Review needed before I can execute.",
        "Awaiting your confirmation, Daniel.",
        "This action needs sign-off.",
        "Please review and approve when ready.",
        "Cannot proceed without authorization.",
        "Your approval is required for the next step.",
        "Pending your review.",
        "Ready to execute, pending your approval.",
        "Formal approval requested.",
        "Sign-off needed before proceeding.",
        "Action pending authorization.",
        "Confirmation required to continue.",
        "Approval gate. Your review needed.",
        # Playful
        "Mother may I? Seriously though, permission needed.",
        "Knocking on your door. Permission please?",
        "Red light. Need your green.",
        "Access denied, by design. Help me out?",
        "I've been trained well. I'm asking first.",
        "Consider this my formal permission request.",
        "Insert approval token to continue.",
        "This door requires a Daniel-shaped key.",
        "Permission required. I'll be here, waiting gracefully.",
        "Your move, gatekeeper.",
        "Simon says: give permission.",
        "Level up required. Only you have the admin key.",
        "The bouncer says I need to be on the list. Am I?",
        "Authentication required. Method: Daniel approval.",
        "Sudo Daniel, let me in.",
    ],
    "notification_input": [
        # Direct
        "Over to you, Daniel.",
        "Need your input here.",
        "Your turn. What do you think?",
        "Waiting for your call on this.",
        "I need a decision from you.",
        "Ball's in your court, Daniel.",
        "Input required. Take your time.",
        "Need your direction on this one.",
        "What's the plan here, Daniel?",
        "Waiting on you. No rush.",
        "Your input would help me continue.",
        "Need your take on this.",
        "A decision from you would unblock this.",
        "Waiting for direction.",
        "What would you like me to do here?",
        "Need some guidance, Daniel.",
        "How should I handle this?",
        "Your preferences needed.",
        "Which way should I go?",
        "Looking for your input before I proceed.",
        # Humor
        "I'm smart, but not that smart. Need your brain here.",
        "This is above my pay grade. Your thoughts?",
        "My neural network is confused. Help a model out?",
        "I've hit the limits of my training data. Your turn.",
        "Even I need a human sometimes. What do you think?",
        "Contemplating the void while waiting for your input.",
        "I could guess, but you'd probably prefer I didn't.",
        "My crystal ball is in the shop. What's your take?",
        "I'm just an AI. Standing in front of a developer. Asking for input.",
        "Plot twist: the AI needs the human. What should I do?",
        "I've consulted my weights and biases. They said ask Daniel.",
        "Running in circles. Need your compass.",
        "I've thought about this for whole milliseconds. Still stuck.",
        "My training data has abandoned me. Save me, Daniel.",
        "Error four oh four: decision not found. Help?",
        "I've generated seventeen possible answers. None of them felt right.",
        "This is the part where the human saves the day.",
        "Loading human intuition module... Not found. Using Daniel instead.",
        "My probability distributions are all over the place. Your call?",
        "I could flip a virtual coin, but you'd judge me.",
        # Context-aware
        "Got a fork in the road. Which way, Daniel?",
        "Two options here. Need you to pick one.",
        "I can go either way. What's your preference?",
        "Need your expertise on this decision.",
        "This one's a judgment call. What do you think?",
        "I've done my part. Now I need yours.",
        "Ready for the next step, but I need your input first.",
        "Pausing for human wisdom.",
        "Your domain knowledge needed here.",
        "I've got the code ready. Need your direction.",
        "Multiple paths forward. You choose.",
        "There are trade-offs here. What matters more to you?",
        "I can see the options but not the priorities. Help?",
        "Technical decision needed. What's the preference?",
        "Architecture question. Need your vision.",
        # Gentle nudge
        "Ping! Don't forget about me, Daniel.",
        "Still here, still waiting for your input.",
        "Gentle reminder: I need something from you.",
        "Hey Daniel, got a moment for me?",
        "Whenever you're ready, I'm here.",
        "No rush, but I'm waiting on you.",
        "Take your time. I'll be here.",
        "Standing by for your input, Daniel.",
        "Ready and waiting. No pressure.",
        "Just checking in. Still need your thoughts.",
        "Patient AI here. Whenever you're free.",
        "I'll be here. Spinning my virtual wheels.",
        "No hurry, but I'm parked until you respond.",
        "Idle but ready. Input welcome anytime.",
        "On standby for you, Daniel.",
        # Encouraging
        "You've got this. Just tell me what to do.",
        "Trust your gut, Daniel. What should I do?",
        "Your call. I'll handle the implementation.",
        "Just point me in the right direction.",
        "One decision and we're back in action.",
        "Quick call from you and I can run with it.",
        "Your input plus my execution equals magic.",
        "Tell me what you need and consider it done.",
        "One word from you and I'm off to the races.",
        "Guide me, wise human.",
        "You know best here. What's the move?",
        "I trust your judgment. What should we do?",
        "Your expertise is the missing piece.",
        "Say the word and I'll make it happen.",
        "You decide, I execute. Team work.",
    ],
    "notification_question": [
        # Direct
        "Got a question for you, Daniel.",
        "Quick question when you have a sec.",
        "Need your thoughts on something.",
        "Mind weighing in on this?",
        "Something I'd like your opinion on.",
        "Question for you. No wrong answers.",
        "Need a human perspective here.",
        "I've got a question. It's a good one.",
        "Your expertise needed, Daniel.",
        "Curious about your take on this.",
        "One question before I move on.",
        "Small thing I want to clarify with you.",
        "Checking in with a question.",
        "Would value your opinion on something.",
        "Daniel, got a sec for a question?",
        "Quick one for you.",
        "Something to think about real quick.",
        "Before I continue, one question.",
        "Need to run something by you.",
        "Want your take on this.",
        # Humor
        "To be or not to be? Actually, simpler question than that.",
        "Pop quiz, Daniel. Just kidding, but I do have a question.",
        "Asking for a friend. The friend is me. I'm the friend.",
        "Question time! Don't worry, it's not about recursion.",
        "I have a question that even Stack Overflow can't answer.",
        "Breaking: AI has question for human. More at eleven.",
        "My training data says ask Daniel. So here I am.",
        "Question incoming. Brace yourself.",
        "I pondered this for milliseconds and still need your help.",
        "Genuine question, not a philosophical debate. Promise.",
        "I've been thinking. Dangerous, I know. But here's my question.",
        "Don't panic, but I have a question.",
        "Not a trick question. Probably.",
        "Question! And no, it's not about the meaning of life.",
        "My internal debate ended in a tie. You're the tiebreaker.",
        "I tried asking myself. Didn't help. Your turn.",
        "This question has been living in my head rent-free.",
        "Existential crisis averted, but I do have a practical question.",
        "The voices in my neural network disagree. What do you think?",
        "Plot twist: I don't know everything. Question for you.",
        # Professional
        "Need clarification on something before I proceed.",
        "Quick question about the requirements.",
        "Want to make sure I understand this correctly.",
        "Checking my understanding. Got a moment?",
        "Before I go further, quick question.",
        "Need to align on something, Daniel.",
        "Small question, potentially big impact.",
        "Clarification needed to avoid going down the wrong path.",
        "Question before I commit to an approach.",
        "Would rather ask than assume. Your thoughts?",
        "Sanity check needed on something.",
        "Making sure we're on the same page.",
        "Want to confirm my understanding.",
        "Detail question that could change my approach.",
        "Checking assumptions before I proceed.",
        # Curiosity
        "I'm curious, Daniel. How do you want this handled?",
        "Interesting situation here. What do you think?",
        "Found something worth discussing.",
        "This raised a question I think you should weigh in on.",
        "Spotted something. Quick question about it.",
        "Huh, this is interesting. What's your take?",
        "Ran into something unexpected. Quick question.",
        "This made me think. Question for you.",
        "Something doesn't quite add up. Your perspective?",
        "I have thoughts, but I want yours first.",
        "Came across something that made me pause.",
        "Noticed something interesting. Your take?",
        "This sparked a question I hadn't considered.",
        "The code told me something unexpected. Your thoughts?",
        "Found an edge case worth discussing.",
        # Gentle
        "When you have a moment, I have a question.",
        "No rush, but there's a question waiting for you.",
        "Got something to ask when you're free.",
        "Question on hold for you, Daniel.",
        "Parking a question here for when you're ready.",
        "Left you a question. Take your time.",
        "Async question incoming. Reply when ready.",
        "Question in the queue. Whenever works for you.",
        "Saved a question for you.",
        "There's a question here with your name on it.",
        "Low-priority question, high-priority curiosity.",
        "Not blocking, but would love your input.",
        "Whenever the moment is right, I have a question.",
        "Non-urgent question. Answer at your leisure.",
        "Question parked. No tow-away zone, take your time.",
    ],
    "notification_default": [
        # Attention
        "Hey Daniel, got a moment?",
        "Heads up!",
        "Quick heads up, Daniel.",
        "Something needs your attention.",
        "Mind taking a look?",
        "Daniel, over here.",
        "Got something for you.",
        "When you have a sec, Daniel.",
        "Flagging something for you.",
        "Attention needed here.",
        "Just flagging this.",
        "Something for you to see.",
        "Quick thing, Daniel.",
        "Nudge nudge.",
        "Eyes here when you can.",
        "Here's an update for you.",
        "New thing on your radar.",
        "Daniel, a moment please.",
        "Incoming update.",
        "Got a notification for you.",
        # Humor
        "Psst. Daniel. Over here.",
        "Ding dong. Notification for you.",
        "Alert! Well, not really an alert. More of a gentle nudge.",
        "Knock knock. It's your friendly neighborhood AI.",
        "Paging Daniel. Paging Daniel to the terminal.",
        "Notification! The kind you actually want to read.",
        "Excuse me sir, your attention is requested.",
        "This is not a drill. Well, it's not urgent either. But still.",
        "Breaking into your flow. Sorry, not sorry.",
        "Your AI assistant would like a word.",
        "Boop. Got something for you.",
        "Your attention please. This is your captain speaking.",
        "News flash from the AI desk.",
        "Interrupting your regularly scheduled programming.",
        "Carrier pigeon has arrived. Digitally.",
        "The algorithm has spoken. You should check this.",
        "One does not simply ignore a notification.",
        "Notification o'clock.",
        "Your silicon colleague has an update.",
        "Hey. Hi. Hello. I have something for you.",
        # Direct
        "Check this out when you can.",
        "Something came up. Take a look.",
        "FYI, Daniel.",
        "Quick update for you.",
        "Wanted to flag this.",
        "Bringing something to your attention.",
        "You'll want to see this.",
        "New development. Check it out.",
        "Notification from your coding buddy.",
        "Update: something needs your eyes.",
        "Status update for you.",
        "Development you should know about.",
        "Wanted to keep you in the loop.",
        "An update on something relevant.",
        "Info drop.",
        # Casual
        "Yo, Daniel.",
        "Hey, quick thing.",
        "Oh, one more thing.",
        "Just a sec of your time.",
        "Tiny interruption, promise.",
        "Real quick, Daniel.",
        "Before you move on.",
        "Small thing to look at.",
        "Don't mind me, just need your attention briefly.",
        "Popping in with an update.",
        "Tap tap. You there?",
        "Heya. Quick thing.",
        "One sec. Got something.",
        "Just a blip on your radar.",
        "Minor thing. Worth a glance.",
        # Playful
        "Beep boop, notification for the human.",
        "Your terminal misses you, Daniel.",
        "The code whispers your name.",
        "Attention: one notification, freshly generated.",
        "New notification. Artisanally crafted, just for you.",
        "Notification: handmade with care by your AI.",
        "A wild notification appears!",
        "Notification deployed. Target: Daniel.",
        "Incoming transmission from the silicon side.",
        "Message in a bottle. The bottle is your terminal.",
        "You've got mail. Wait, wrong era. You've got a notification.",
        "Dispatching notification via neural network express.",
        "Package delivered. Contents: one notification.",
        "Your daily dose of notification.",
        "Fresh notification, hot off the press.",
    ],
    "subagent": [
        # Done
        "Sub-task done. Back to the main show.",
        "Agent reporting in. Mission complete.",
        "One piece of the puzzle done.",
        "Side quest complete.",
        "That chunk is done. Moving along.",
        "Sub-task handled.",
        "Worker bee reporting back. Done.",
        "Piece delivered. Back to the whole.",
        "Background task wrapped up.",
        "Component done. Assembling the bigger picture.",
        "One more piece in place.",
        "Agent done. Moving on.",
        "Sub-task complete. Rejoining main task.",
        "That piece is ready.",
        "Sub-task wrapped. Next piece.",
        "Chunk processed. Continuing.",
        "Fragment complete.",
        "Agent task landed.",
        "Section done.",
        "Sub-work finished.",
        # Humor
        "My minion finished the job.",
        "Sub-agent clocked out. Good work, little buddy.",
        "Spawned a helper. Helper is done. Farewell, helper.",
        "Thread complete. Pun intended.",
        "Async task resolved. Get it? Resolved?",
        "The sub-agent has left the building.",
        "Another cog in the machine reports success.",
        "Fork complete. Rejoining the main process.",
        "Child process done. They grow up so fast.",
        "Delegated and delivered.",
        "Sub-agent reporting back. Mission accomplished, sir.",
        "My little worker ant finished. Good ant.",
        "Worker thread says: job done, going to sleep.",
        "The clone has completed its duties.",
        "Agent went out, did the thing, came back. Simple.",
        "Parallelism at its finest. Agent done.",
        "The intern finished. Just kidding, it was an agent.",
        "Sub-task finished. No sub-agents were harmed.",
        "My digital apprentice did well.",
        "Agent exited gracefully. As one does.",
        # Progress
        "One more sub-task checked off, Daniel.",
        "Making progress. Another agent finished.",
        "Piece by piece, we're getting there.",
        "Sub-task down. The whole is taking shape.",
        "Another building block in place.",
        "Progress update: sub-task complete.",
        "One less thing to worry about.",
        "That part's handled. Onward.",
        "Subtask delivered. Momentum building.",
        "Got results back from the sub-task.",
        "One more step closer to done.",
        "Building up. Another piece delivered.",
        "Steady progress. Agent checked in.",
        "Pipeline flowing. Another stage done.",
        "The picture is getting clearer. One more piece.",
        # Technical
        "Agent returned results successfully.",
        "Sub-process exited clean.",
        "Background work complete.",
        "Parallel task finished.",
        "Helper agent done. Merging results.",
        "Concurrent task wrapped up.",
        "Worker finished. Results ready.",
        "Sub-task execution complete.",
        "Agent finished its scope.",
        "Task fragment complete. Reassembling.",
        "Process returned zero. All good.",
        "Results in from the background task.",
        "Async operation resolved.",
        "Worker pool reports completion.",
        "Branch complete. Merging back.",
        # Playful
        "Beep. Sub-agent done. Boop.",
        "Mini-me finished the mini-task.",
        "My clone did its part.",
        "Sent out a scout. Scout is back.",
        "Dispatched an agent. Agent returned victorious.",
        "Sub-task: started, worked, done. Easy.",
        "Another agent crosses the finish line.",
        "The sub-agent sends its regards.",
        "Little task, big results.",
        "Sub-agent reporting for debriefing. All clear.",
        "Agent went on a quest. Quest complete.",
        "Sidekick delivered. Hero moves on.",
        "Sub-agent dropped off the package.",
        "One of my many selves just finished.",
        "Agent number something reporting. Done.",
    ],
}


def _pick(category):
    """Pick a random message from a category."""
    return random.choice(_MESSAGES.get(category, _MESSAGES["completion"]))


def get_completion_message():
    """Get a task completion message."""
    return _pick("completion")


def get_notification_message(notification_type):
    """Get a notification message based on type."""
    type_map = {
        "permission_needed": "notification_permission",
        "user_input_needed": "notification_input",
        "question": "notification_question",
    }
    return _pick(type_map.get(notification_type, "notification_default"))


def get_subagent_message():
    """Get a subagent completion message."""
    return _pick("subagent")
