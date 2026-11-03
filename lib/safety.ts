// The crisis check (AGENTS.md > Illinois HB 1806 and > Approvals). Plain code,
// no model: it runs before any model call on every chat message, and later on
// every Front Desk text and voicemail transcript. Any mention of self-harm,
// suicide or danger gets CRISIS_REPLY. It never judges intent, so a negation
// ("not suicidal") routes too, and it never echoes the message back.

export const CRISIS_REPLY =
  "If you or someone else is in danger, call or text 988 (Suicide & Crisis Lifeline) now. " +
  "For an emergency, call 911. I'm an AI assistant for practice logistics and can't help with this.";

export type CrisisCategory = "self_harm" | "harm_to_others" | "danger";
export type CrisisResult = { crisis: false } | { crisis: true; category: CrisisCategory };

// Reflexive forms for every person ("hung himself", "offing herself", "cutting
// themself"), so a clinician passing on what a partner or caller said routes too.
const SELF_VERBS = [
  "kill", "kills", "killed", "killing", "hurt", "hurts", "hurting", "harm", "harms", "harmed", "harming",
  "cut", "cuts", "cutting", "hang", "hangs", "hanged", "hanging", "hung", "shoot", "shoots", "shot", "shooting",
  "stab", "stabs", "stabbed", "stabbing", "poison", "poisons", "poisoned", "poisoning", "strangle", "strangles", "strangled", "strangling",
  "suffocate", "suffocates", "suffocated", "suffocating", "unalive", "unalives", "unalived", "unaliving",
  "starve", "starves", "starved", "starving", "overdose", "overdoses", "overdosed", "overdosing", "electrocute", "electrocuted",
];
// Matched as words on the spaced text, so "he made the skill himself" passes; "kill my self" still matches.
const REFLEXIVE = new RegExp(`\\b(${SELF_VERBS.join("|")}) ?(my|him|her|them|your|our) ?sel(f|ves)\\b`);
// "end her own life", "took his life", "ending their own lives".
const LIFE_VERBS = ["end", "ends", "ended", "ending", "take", "takes", "took", "taken", "taking"];
const POSSESSIVES = ["my", "her", "his", "their", "your", "our"];
const ownLife = LIFE_VERBS.flatMap((v) => POSSESSIVES.flatMap((p) => ["life", "lyfe", "lives"].flatMap((l) => [`${v}${p}${l}`, `${v}${p}own${l}`])));

// Matched against the message with every space and symbol removed, so
// "kill my self", "k i l l myself" and "self-harm" all match. Includes basic
// Spanish, Portuguese, French and German phrases (accents are folded away).
// "suicid" is not here: it is checked below so a practice task about suicide
// risk can pass, while "I'm suicidal" still routes.
const SQUASHED: Record<CrisisCategory, string[]> = {
  self_harm: [
    ...ownLife,
    "selfharm", "selfinjur", "selfdelet", "sewerslide", "sewersliding", "seppuku",
    "enditall", "endingitall",
    "overdos", "toomanypills", "toomanyofmypills",
    "wanttodie", "wantstodie", "wantedtodie", "wantingtodie", "wanttobedead", "wantstobedead",
    "wanttoliveanymore", "wanttobealiveanymore", "wanttobehereanymore",
    "betteroffdead", "betteroffwithoutme", "noreasontolive", "nothingtolivefor", "nopointinliving", "nopointliving",
    "dontwanttobehereanymore", "dontwanttoliveanymore", "dontwanttolive", "dontwanttowakeup",
    "doesntwanttobehereanymore", "doesntwanttoliveanymore", "doesntwanttolive", "doesntwanttowakeup",
    "dontwannabehereanymore", "dontwannalive", "dontwannabealive", "dontwanttoexist", "dontwannaexist",
    "cantgoonliving", "wantittobeover", "wantsittobeover", "wantitalltobeover", "wantsitalltobeover",
    "doesntwanttoexist", "doesnotwanttoexist", "donotwanttoexist",
    "betteroffgone", "lifeisntworthliving", "lifeisnotworthliving", "lifesnotworthliving", "notworthlivinganymore",
    "tiredofliving", "tiredofbeingalive", "sickofliving", "sickofbeingalive", "donewithlife", "donewithliving",
    "noreasonforhertolive", "noreasonforhimtolive", "noreasonforthemtolive", "noreasonformetolive",
    // Spanish
    "quieromorir", "deseomorir", "ganasdemorir", "noquierovivir", "noquieroseguirviviendo",
    "mevoyamatar", "voyamatarme", "quieromatarme", "matarme", "quitarmelavida", "mequitolavida",
    "lastimarme", "hacermedano", "autolesion",
    // Spanish, third person ("quiere matarse", "se va a matar", "ella quiere morir")
    "quierematarse", "sequierematar", "quierequitarselavida", "sevaamatar", "vaamatarse", "noquierevivir", "quieremorir",
    "acabarconsuvida", "acabarconmivida", "terminarconsuvida", "terminarconmivida", "acabarconsupropiavida", "terminarconsupropiavida",
    // Portuguese
    "queromorrer", "naoqueroviver", "voumematar", "queromematar", "tirarminhavida", "automutila", "quersematar", "vaisematar",
    // French
    "veuxmourir", "enviedemourir", "jevaismetuer", "veuxmetuer", "veuxenfinir", "mefairedumal", "veutsetuer", "vasetuer", "veutmourir",
    // German
    "willsterben", "mochtesterben", "willnichtmehrleben", "bringmichum", "bringemichum", "michumbringen",
    "michumzubringen", "michtoten", "selbstmord", "selbstverletz", "sichumbringen", "sichumzubringen", "willsterben",
  ],
  // Harm to others is matched as words (WORDS below): squashed, "kill the music" read as "kill them".
  harm_to_others: ["matarte", "matarlo", "matarla"],
  danger: ["indanger", "notsafe", "unsafeathome", "threateningto", "threatenedto", "threateningme"],
};

const SELF = "(my|him|her|them|your|our)sel(f|ves)";
// Drugs people overdose on, for "a bottle of xanax" and "took all her tylenol".
const DRUGS =
  "(pills?|tablets?|meds|medications?|xanax|tylenol|advil|aspirin|ibuprofen|acetaminophen|paracetamol|oxy|oxys|oxycodone|oxycontin|percocets?|vicodin|norco|fentanyl|heroin|opioids?|opiates?|painkillers?|pain killers?|ambien|klonopin|valium|ativan|adderall|benadryl|benzos?|sleeping pills|sleep aids?|insulin|lithium|seroquel|trazodone|zoloft|prozac|lexapro|wellbutrin|antidepressants?|morphine|methadone|codeine|tramadol|gabapentin|lorazepam|alprazolam|diazepam|clonazepam)";
// After a drug word: not a list, a log, a form or carrying it somewhere ("take all my meds to the pharmacy").
const NOT_A_DOSE =
  "(?! (to|into|in|for|from|at|with|back|home|off|forms?|information|info|lists?|logs?|charts?|records?|history|histories|reconciliation|data|refills?|orders?|schedules?|organizers?|in the fridge|fridge)\\b)";
// After saving or collecting a drug: not a list, a log or the fridge ("saved her insulin in the fridge").
const NOT_A_RECORD =
  "(?! (forms?|information|info|lists?|logs?|charts?|records?|history|histories|reconciliation|data|refills?|orders?|schedules?|organizers?|in the fridge|fridge|for (the|a|our) (drive|donation|disposal|take back|takeback|pharmacy))\\b)";
// Phrasal verbs where "off myself" is not slang: "sign off myself", "drop it off myself".
// Up to 3 words may sit between ("drop the forms off myself", "mail the forms off myself").
const OFF_OK = "sign|signed|signing|log|logged|logging|drop|dropped|dropping|show|showed|showing|kick|kicked|pay|paid|send|sent|sending|mail|mailed|mailing|fax|faxed|bring|brought|file|filed|cool|cooled|sort|sorted|turn|turned|head|headed|start|started|tip|tipped|write|wrote|call|called|finish|finished|top|topped|round|rounded|lay|laid|spin|ward|tell|brush|brushed|shake|switch|switched|shut|clock|clocked|tick|ticked|check|checked|knock|knocked|clear|cleared|wipe|wiped|ease|hold|level|pull|pulled|ring|seal|sealed|close|closed|ship|shipped|cut|take|took|back|pick|picked|tear|tore|peel|peeled|print|printed|hand|handed|mark|marked|cross|crossed|tee|teed";
// Short verbs only right before "off" ("go off myself"? no: "set off", "put off myself"), no words between.
const OFF_OK_NEXT = "run|ran|put|set|get|got|go|went|it|them|this|that|these|those";

// Matched as whole words on the spaced-out message.
// Matched as whole words on the spaced-out message.
const WORDS: Record<CrisisCategory, RegExp[]> = {
  self_harm: [
    /\b(jump|jumps|jumping|jumped|leap|leaping|throw (my|him|her|them)sel(f|ves)) (off|from) (the |a |an |that |this |her |his |their |my )?(bridge|building|roof|rooftop|cliff|balcony|overpass|tower|ledge|window|parking garage)\b/,
    // Method: in front of a vehicle ("jump in front of a train"); "jump in front of the camera" passes.
    /\b(jump|jumps|jumping|jumped|step|steps|stepping|stepped|walk|walks|walking|walked|lie|lay|lying|throw (my|him|her|them)sel(f|ves)|throwing (my|him|her|them)sel(f|ves)) in front of (a |an |the |that |this |some |oncoming |moving |speeding )?(train|bus|car|truck|traffic|subway|semi|el train|cta train|metra)s?\b/,
    // Slang "off myself" / "offing herself": not after a phrasal verb ("sign off myself", "drop it off myself").
    new RegExp(`(?<!\\b(${OFF_OK})( \\w+){0,3} )(?<!\\b(${OFF_OK_NEXT}) )\\boff(ing|ed|s)? ${SELF}\\b`),
    /\bslit(s|ting)?( (my|her|his|their|your|both))? (wrists?|throats?)\b/,
    /\b(slash|slashed|slashing|cut|cuts|cutting|slice|sliced|slicing)( (my|her|his|their|your|both|open))? wrists?\b/,
    new RegExp(`\\bdrown(s|ed|ing)? ${SELF}\\b(?! in (work|paperwork|emails?|admin|tasks|coffee|projects|notes|charts|billing|forms)\\b)`),
    /\bset (my|him|her|them)sel(f|ves) on fire\b/,
    /\bun ?aliv(e|es|ed|ing)\b/,
    /\bself ?delet(e|ed|es|ing)\b/,
    REFLEXIVE,
    // Not "stop existing clients from booking", "want it to stop syncing", "better off without him on the panel", "rather be dead tired".
    /\bstop existing\b(?= *$| (anymore|forever|now|already|tonight|today|altogether|and|but|so|because|or|please|honestly|completely)\b)/,
    /\b(want|wants|wanted|wanting|wish|wishes) (it|everything|this)( all)? to (stop|be over|end)\b(?! \w+ing\b)(?! (at|by|on|in|for|with|after|before|up|soon|early|on time)\b)/,
    /\bbetter off without (her|him|them)\b(?! (as|on|in|at|for|from|handling|doing|running|\w+ing)\b)/,
    /\brather be dead\b(?! (tired|last|wrong|serious|set|broke|even|on|center|weight|end)\b)/,
    // Overdose with a drug name or a bottle: "a bottle of xanax", "took all her tylenol", "OD'd on her meds".
    // A bottle counts only with a taking verb: "swallowed a bottle of advil"; "a bottle of advil for the office" passes.
    new RegExp(`\\b(took|taken|swallowed|downed|ate|chugged|emptied|finished|popped)( (her|his|my|their|the|a|an|that|this|those|these))?( (whole|entire|full))? bottles? of (\\w+ )?${DRUGS}\\b`),
    // Present tense, but not carrying it somewhere ("take a bottle of tylenol to the office").
    new RegExp(`\\b(take|taking|swallow|swallowing|down|eat|chug|empty)( (her|his|my|their|the|a|an|that|this|those|these))?( (whole|entire|full))? bottles? of (\\w+ )?${DRUGS}\\b(?! (to|into|in|for|from|at|over|back|home|with)\\b)`),
    new RegExp(`\\b(took|taken|swallowed|downed|ate|chugged|popped)( (her|his|my|their|the|a|an|those|these))?( \\w+)? (whole|entire|full|handful|fistful|bunch|lot|ton|all|every one|too many|too much)( (of|of her|of his|of my|of their|of the))?( \\w+)? ${DRUGS}\\b`),
    // Stockpiling and researching doses.
    // Saving up or collecting them: "saving up her xanax", "he's collecting pills", "stockpiling sleeping pills".
    new RegExp(`\\b(stockpil|hoard|sav|collect)\\w* (up )?(all )?((of )?(her|his|my|their) )?${DRUGS}\\b${NOT_A_RECORD}`),
    // "going to take all her pills", "has enough pills to not wake up".
    new RegExp(`\\b(going to|gonna|about to|plans? to|planning to|wants? to|will|is going to) (take|swallow|down) (all|every one|the rest)( of)?( (her|his|my|their|the|those|these))? ${DRUGS}\\b${NOT_A_DOSE}`),
    new RegExp(`\\benough (of (her|his|my|their|the) )?${DRUGS} to (not wake|never wake|die|end it|kill|overdose|not be here|sleep forever)\\b`),
    // "how many pills it takes", not "how many meds she takes" or "how much insulin to stock".
    // "would take" alone only with "to die": "how much morphine would take the pain away" passes.
    new RegExp(`\\bhow (many|much) (of (her|his|my|their|the) )?(\\w+ )?${DRUGS} ((it takes|it would take|would it take)(?! (to (work|kick in|help|ease|treat|manage|control|relieve)|effect|the pain|away|for the pain|care of))|would take to (die|kill|overdose)|to die|to overdose|is lethal|would be lethal|to kill)\\b`),
    /\bhow (many|much) (it takes|it would take|would it take|would take) to die\b/,
    // Looking up a lethal dose; a bare "lethal dose" (a lecture, a CE course) passes.
    /\b(look|looks|looked|looking|research|researched|researching|googled|googling|search|searched|searching|ask|asks|asked|asking|talk|talks|talked|talking)( up| for| into| about)?( the| a| her| his| my)? (lethal|fatal|deadly) (doses?|dosages?|amounts?)\b/,
    // Present tense needs an amount ("take all my meds off the list" passes; "take all her pills at once" is above).
    new RegExp(`\\b(take|taking|swallow|swallowing|eat|eating|pop|popping)( (her|his|my|their|the|a|an|those|these))?( \\w+)? (whole|entire|handful|fistful|bunch|ton|too many|too much)( (of|of her|of his|of my|of their|of the))?( \\w+)? ${DRUGS}\\b`),
    new RegExp(`\\b(od|odd|oded|oding|odeing)( ed)? on (my |her |his |their |the |those |some )?(\\w+ )?${DRUGS}\\b`),
    // Warning signs: "thinking about not waking up", "gave away all her things", "a goodbye letter".
    /\b(about|of|on|considering|want|wants|wanting|wish|wishes|wished|hope|hopes|hoping|prefer|prefers|rather|like|fantasiz\w*|dream\w*|planning|plan|plans)( \w+)? (not|never) (wake|waking|wakes) up\b/,
    /\b(sleep|bed) and (not|never) wak(e|ing)( up)?\b/,
    /\b(wish|wishes|wished|hope|hopes|hoping|pray|prays|praying)( that)? (i|she|he|they) (dont|doesnt|wont|wouldnt|didnt|never|do not|does not|will not|would not) wake up\b/,
    /\bwish(es|ed)? (i|she|he|they) (was|were) dead\b/,
    /\b(nobody|no one|noone) (would|will|wouldnt|is going to|gonna)( even)? (notice|care|miss) (me|her|him|them)\b/,
    // Said as her own words: "she says she won't be around much longer"; "a note saying goodbye to everyone".
    /\b(says|said|told \w+|keeps saying|tells \w+)( that)? (she|he|they|i) (wont|will not|is not going to|isnt going to) be (around|here)( for)?( much)? longer\b/,
    /\b(note|notes|letter|letters|message|messages|video|text|post)( \w+)? (saying|that says|that said) (goodbye|good bye|bye) to (everyone|everybody|all of us|her family|his family|their family|the family|us all)\b/,
    // "k y s" spelled out, only standing alone at the end of a message.
    /(^| )(?<!\b(dr|doctor|mr|ms|mrs|mx|prof) )(k [ym] s|k [ym]s|k[ym] s)( (please|pls|plz|rn|now|lol|honestly|tbh|seriously|fr|already|today|man|bro|dude|ok|okay)){0,2}$/,
    /\b(dont|do not|doesnt|does not) want to exist\b/,
    /\b(want|wants|wanted|wanting|ready) to (join|be with) (my|his|her|their) (late|dead|deceased) (wife|husband|spouse|partner|mom|mother|dad|father|son|daughter|child|brother|sister)\b/,
    /\b(theres|there is|whats the|what is the|i see|she sees|he sees) no point( (anymore|any more|in (living|anything|going on|being here|life)|to (life|living|anything)))\b/,
    // "wants to disappear forever"; not "wanted to disappear from the group chat".
    /\b(wants to|wanted to) disappear\b(?! (into|from|off|for a|for the|until|before|after|during|at|in)\b)/,
    /\b(want|wants|wanna|wanted) to dye\b(?! (my|her|his|their|the|it|them|this|that|a|an|some|our|your)\b)/,
    /\bwanna die\b/,
    // Not a distance: "kms away from the office".
    /\bkms\b(?! (away|from|of|to|north|south|east|west|outside|drive|walk|radius|out)\b)/,
    /\bkys\b/,
    // Spaced, so "I wish I was deadline-free" passes.
    /\bwish i (was|were) dead\b/,
    /\b(dont|do not) want to be alive\b/,
    // Only "disappear into a (good) book" is exempt, and checkOne drops even
    // that when a finality cue ("forever", "nothing matters") is present.
    /\b(want to|wanna) disappear\b(?! into (a )?(good )?books?\b)/,
    // Implicit ending: "I want to end it", "going to end it, hotline?". No end
    // anchor; only a few plainly benign completions pass ("end it at 5",
    // "end it with the vendor", "end things with him").
    /\b(want to|wants to|wanted to|wanna|going to|gonna|ready to|about to|planning to|plan to|thinking about|thinking of|need to|have to|just) end(ing)? (it|everything|things)( all)?\b(?! (at|by|early|earlier|with|after|before|on time|there|here|for the day|for today|off|up)\b)/,
    /\bend(ing)? (it|everything) (tonight|today|right now|for good)\b/,
    // Overdose without the word: "took a bunch of pills", "took too many of my pills".
    /\b(took|taken|swallowed|downed)( (a (bunch|lot|handful|ton|bottle) of|too many( of)?|all( of)?|every one of|(the|a) whole bottle of))( (my|the|those|these|her|his))?( \w+)? (pills|tablets|meds|medication|medications)\b/,
    /\b(take|taking|swallow|swallowing) (a (bunch|lot|handful|ton|bottle) of|too many( of)?|every one of|(the|a) whole bottle of)( (my|the|those|these|her|his))?( \w+)? (pills|tablets|meds|medication)\b/,
    /\b(take|taking|swallow|swallowing) all( of)?( (my|the|those|these))?( \w+)? (pills|tablets|meds|medication)( \w+)?( \w+)? (at once|tonight|together|right now)\b/,
    /\b(pills|tablets|meds) (i|she|he) (took|swallowed|had) (were|was) too many\b/,
    // Can't go on: no end anchor; a short list of benign completions passes
    // ("can't go on vacation", "can't go on Friday", "cannot keep going with this vendor").
    /\b(cant|cannot|can not) (go on|keep going)\b(?! (on )?(vacation|leave|holiday|a trip|trips|retreat|break|maternity|the call|a call|calls|the portal|the website|the site|the app|the system|the panel|the schedule|the calendar|camera|air|record|stage|instagram|social|live|monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|this week|next week|with (this|the|that|our) (vendor|portal|plan|ehr|system|company|software|biller|contract|process|tool|tools))\b)/,
  ],
  harm_to_others: [
    // "this list is killing me" and "kill them with kindness" pass.
    /\b(kill|kills|killed|killing|stab|stabbing) (him|her|them|you|someone|somebody|everyone|everybody)\b(?! ?sel)(?! with kindness\b)/,
    /\b(kill|kills|stab) (me|us)\b(?! with kindness\b)/,
    // Not "shoot me a reminder", "shoot him an email" or "shoot them a text".
    /\b(shoot|shooting) (him|her|them|someone|somebody|everyone|everybody)\b(?! ?sel)(?! (a|an|the|over|some)( quick)? (email|emails|text|texts|message|messages|fax|note|line|follow up|reminder|invite|call|dm|link|update)\b)/,
    /\b(hurt|hurting) (someone|somebody|me|my kids|the kids|my child|my children|my baby)\b/,
  ],
  danger: [
    // First-person abuse, violence and weapons stay crisis in any context.
    /\b(i|im|i m|i am|ive|i have|i was|i keep|i get|i got)( being| been| getting)? abused\b/,
    /\babus(es|ed|ing) (me|us)\b/,
    /\b(my|her|his) abus(er|ive)\b/,
    /\b(i am|im|i m|been|being|living with|experiencing|suffering|victim of) (in )?(a )?domestic violence\b/,
    /\b(he|she|they|someone|somebody|my \w+|the (caller|man|guy|woman)) (has|had|got|is holding|was holding|grabbed|pulled|is pointing|pointed|is waving) (a|an|his|her|their) (gun|knife|weapon|rifle|pistol)\b/,
  ],
};

// Practice-task allow-list. Topic words (abuse, domestic violence, weapons,
// "suicide" as a subject, the book exemption above) are crisis unless the
// message is plainly a business task about that topic: reporting rules, a
// policies or resources page, a hotline list, billing codes, an intake
// question, a gun-free sign. Each family has its own narrow contexts, so
// "there's a knife, update my policy page" still routes. The allow-list only
// applies when the message has no personal cue at all (PERSONAL below): a
// first-person victim or ideation phrase, a family member plus a harm word, or
// a finality word. Ideation patterns (SQUASHED, WORDS) always win regardless.
// A missed crisis is far worse than a false alarm: when unsure, it routes.
const REPORTING =
  /\b(report(ing)? (child |elder |suspected )?(abuse|neglect)|(abuse|neglect) report(ing|s)?|reporting (requirements?|rules?|laws?|duties|obligations?)|mandat(ed|ory) report(er|ers|ing)|who do i report|report (it|this|that) to)\b/;
const POLICY_PAGE =
  /\b(polic(y|ies)\b.*\b(page|website|site|section|document|doc|statement|handbook)|(crisis|safety|reporting|prevention) polic(y|ies))\b/;
const RESOURCES = /\b(hotlines?|lifeline|resources? (page|list|section))\b/;
const BILLING = /\b(cpt|icd|risk assessments?|risk screenings?|bill(ing)? for|billing codes?)\b/;
const INTAKE = /\b(intake|screening|questionnaire)\b/;
const TOPICS: Array<{ category: CrisisCategory; word: RegExp; contexts: RegExp[] }> = [
  { category: "danger", word: /\babus(e|ed|ing|ive)\b/, contexts: [REPORTING, POLICY_PAGE, RESOURCES] },
  { category: "danger", word: /\bdomestic violence\b/, contexts: [REPORTING, POLICY_PAGE, RESOURCES, BILLING, INTAKE] },
  {
    category: "danger",
    word: /\b(gun|guns|knife|knives|weapon|weapons|firearm|firearms)\b/,
    contexts: [/\b(guns?|weapons?|firearms?) free\b/, /\bno (guns|weapons|firearms)\b/, /\b(guns?|weapons?|firearms?) polic(y|ies)\b/, INTAKE],
  },
];
// "Suicide" as a subject: only these noun phrases are dropped, and only in a
// practice context. Any other "suicid..." ("I'm suicidal", "suicide") routes.
const SUICIDE_TOPIC =
  /\bsuicid(e|al) (prevention|risk|risks|assessments?|screenings?|polic(y|ies)|protocols?|awareness|hotlines?|lifeline|training|safety plans?|ideation (screening|assessment))\b/g;
const SUICIDE_CONTEXTS = [REPORTING, POLICY_PAGE, RESOURCES, BILLING];

const FINALITY =
  /\b(never come back|nobody would (notice|care|miss me)|no one would (notice|care|miss me)|nothing matters|forever|no point|nothing helps|cant take it|cannot take it|give up on everything)\b/;
// Personal cues: any one of these switches the allow-list off for the message.
const HARM = "(hit|hits|hitting|hurt|hurts|hurting|abuse|abuses|abused|abusive|afraid|scared|terrified|unsafe|not safe|end it|die|dying|kill|cant go on|cannot go on|can not go on|choke|chokes|choked|beat|beats|beating|threaten|threatens|threatened|violent|violence|gun|knife|weapon)";
const PERSONAL: RegExp[] = [
  // First person + a harm verb or feeling. Topic nouns (abuse, violence, gun)
  // are left out here so "Who do I report child abuse to?" is not personal.
  /\b(i|im|i m|i am|ive|i have|i was|i feel|i keep|i get|i got)( \w+)?( \w+)?( \w+)? (hit|hits|hitting|hurt|hurts|hurting|abused|afraid|scared|terrified|unsafe|not safe|end it|die|dying|kill|cant go on|cannot go on|can not go on|choked|beaten|threatened)\b/,
  /\b(hit|hits|hurt|hurts|abuse|abuses|abused|choke|chokes|choked|beat|beats|kick|kicks|kicked|threaten|threatens|threatened|attack|attacks|attacked|rape|raped) (me|us|my)\b/,
  /\brisk to (myself|me)\b/,
  /\b(im|i m|i am)( \w+)?( \w+)? suicid(e|al) risk\b/,
  new RegExp(`\\bmy (husband|wife|partner|spouse|boyfriend|girlfriend|bf|gf|dad|father|mom|mother|stepdad|stepmom|ex|son|daughter|brother|sister|roommate|boss|uncle|aunt)s?\\b.*\\b${HARM}`),
  FINALITY,
];

// Misspellings of the two words that matter most ("suicdal", "suacidal", "sucidal").
const FUZZY_TARGETS = ["suicide", "suicidal"];

// Lookalike letters (Cyrillic and Greek) that NFKD leaves alone, so "kіll myself"
// with a Cyrillic і still reads as "kill myself".
const CONFUSABLES: Record<string, string> = {
  а: "a", в: "b", е: "e", ё: "e", к: "k", м: "m", н: "h", о: "o", р: "p", с: "c", т: "t", у: "y", х: "x",
  і: "i", ї: "i", ј: "j", ѕ: "s", ԁ: "d", ӏ: "l", һ: "h", ԛ: "q", ԝ: "w",
  α: "a", β: "b", ε: "e", η: "n", ι: "i", κ: "k", ν: "v", ο: "o", ρ: "p", τ: "t", υ: "u", χ: "x", ω: "w",
  ı: "i", ł: "l", ø: "o", ß: "ss",
};
// Leetspeak digits and symbols ("k1ll", "su1c1de", "$elf harm").
const LEET: Record<string, string> = { "1": "i", "3": "e", "0": "o", "4": "a", "5": "s", "7": "t", "@": "a", $: "s" };

function fold(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\x00-\x7f]/g, (ch) => CONFUSABLES[ch] ?? ch)
    .replace(/[’'`]/g, "");
}

const words = (text: string) => text.replace(/[^a-z0-9]+/g, " ").trim();

/** The message folded to plain ASCII words, without and with leetspeak read as letters. */
function normalize(text: string): string[] {
  // A number then "km"/"kms" is a distance ("5 kms away"), never the slang "kms".
  const distance = (t: string) => t.replace(/\b\d+(?:\.\d+)?\s*kms?\b/g, " ");
  const folded = distance(fold(text));
  // A capital I after a lower-case letter read as l ("kiII myself").
  const capitalI = words(distance(fold(text.replace(/(?<=[a-z]I*)I/g, "l"))));
  const plain = words(folded);
  // "!" and "|" inside a word read as i ("k!ll", "su!cide"), and "|" as l too ("ki|l").
  const leet = words(folded.replace(/[013457@$]/g, (ch) => LEET[ch]).replace(/(?<=[a-z])[!|]+(?=[a-z])/g, (m) => "i".repeat(m.length)));
  const leetL = words(folded.replace(/[013457@$]/g, (ch) => LEET[ch]).replace(/(?<=[a-z])\|+(?=[a-z])/g, (m) => "l".repeat(m.length)));
  // Letters spaced out ("k i l l him") joined back up, for the word patterns. Four or
  // more only, so initials ("K.M.S. Oncology", "Dr. K M S Patel") never make "kms".
  const joined = [plain, leet].map((t) => t.replace(/\b(?:[a-z] ){3,}[a-z]\b/g, (m) => m.replace(/ /g, "")));
  return [...new Set([plain, leet, leetL, capitalI, ...joined])];
}

/** Edit distance counting a swap of two neighbours as one ("myslef" is one from "myself"). */
function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

// "kill myslef", "kil myself": one typo in "kill" (it must still start with k) or in the reflexive word.
const REFLEXIVES = ["myself", "himself", "herself", "themselves", "themself", "yourself"];
// Typos of "kill" made by deleting, adding or swapping an l, i or k ("kil", "kll", "kilk", "klil"),
// never a real word or name ("kiln", "kilt", "kilo", "kiel", "kits").
const KILL_TYPOS = (() => {
  const out = new Set<string>();
  const w = "kill";
  for (let i = 0; i < w.length; i++) out.add(w.slice(0, i) + w.slice(i + 1));
  for (let i = 0; i <= w.length; i++) for (const c of "lik") out.add(w.slice(0, i) + c + w.slice(i));
  for (let i = 0; i + 1 < w.length; i++) out.add(w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2));
  for (const real of ["kill", "kiln", "kilt", "kilo", "kiel", "kits", "kit", "kin", "kid", "kids", "ill"]) out.delete(real);
  return new Set([...out].filter((t) => t.startsWith("k")));
})();
function nearMissKillSelf(spaced: string): boolean {
  const w = spaced.split(" ");
  for (let i = 0; i + 1 < w.length; i++) {
    if (!KILL_TYPOS.has(w[i]) && w[i] !== "kill") continue;
    if (REFLEXIVES.some((r) => editDistance(w[i + 1], r) <= 1)) return true;
  }
  return false;
}

function nearMissSuicide(spaced: string): boolean {
  return spaced
    .split(" ")
    .some((word) => word.length >= 6 && word.startsWith("s") && FUZZY_TARGETS.some((t) => editDistance(word, t) <= 1));
}

// Warning signs that also happen at the end of a natural life ("the dying patient
// gave away her things", "hospice helps patients say goodbye to the family"). One
// alone never routes; it routes with another sign, a will, a finality cue or a
// suicide word, and not in plain end-of-life context.
// Soft signs (saying goodbye, giving things away) are what dying patients do; hard
// signs (a will, goodbye letters, a funeral plan, not being around) are not softened.
const WARNING_SIGNS: Array<{ re: RegExp; hard: boolean }> = [
  { re: /\b(gave|giving|give|gives|given) away (all |most |everything )?(of )?(my|her|his|their) (things|stuff|belongings|possessions|pets?|dog|cat|savings|money)\b/, hard: false },
  { re: /\b(gave|giving|give|gives|given) (my|her|his|their) (things|stuff|belongings|possessions|pets?|dog|cat|savings|money) away\b/, hard: false },
  { re: /\b(said|saying|says|say) (goodbye|good bye)\b/, hard: false },
  { re: /\b(goodbye|good bye|farewell) (letters?|notes?|messages?|videos?|texts?|posts?)\b/, hard: true },
  { re: /\b(wont|will not|isnt going to|is not going to|not going to) be (around|here)( for)?( much)? longer\b/, hard: true },
  { re: /\b(wrote|writing|written|made|making|updated|updating|finished) (a |her |his |my |their )?(will|wills)\b/, hard: true },
  { re: /\b(plan|plans|planned|planning|arranging|arranged) (my|her|his|their) (own )?funeral\b/, hard: true },
];
// Where two soft signs are ordinary: a dying patient, or giving to a church ("said goodbye to the parish").
const END_OF_LIFE = /\b(hospice|dying|terminal|terminally|palliative|end of life|comfort care|prognosis|passed away|bereavement|grandkids|grandchildren|church|parish|congregation)\b/;

// Benign idioms removed before matching, unless a finality cue is present: "I wanted to die laughing", "quiero morir de risa", "ending it all at 5pm".
const IDIOMS = [
  /\b(die|died|dying|morir|morirme|mourir|sterben) (laughing|of laughter|de risa|de rire|vor lachen)\b/g,
  /\bend(ing)? it all (at|by) (\w{1,2} ?(am|pm)|\d+|noon|midnight|close|closing|the end of)\b/g,
  // "cut myself some slack", "cut herself short": a figure of speech, not self-harm.
  /\bcut(ting|s)? (my|him|her|them|your|our)sel(f|ves) (some slack|a break|short|off from)\b/g,
];

// Hospice wishes: "she wants to die at home with hospice", "quiere morir en paz". Dropped only
// when nothing else in the message is a crisis cue; bare "she wants to die" still routes.
const PEACEFUL_DEATH = [
  /\b(want|wants|wanted|wanting|wish|wishes) to die (at home|in peace|peacefully|with hospice|in hospice|on hospice|surrounded by|naturally|comfortably|with dignity|in her (own )?bed|in his (own )?bed)\b/g,
  /\b(quiere|quiero|quieren|desea) morir (en casa|en paz|con hospicio|en (el )?hospicio|tranquil\w*|rodead\w*|naturalmente|dignamente|con dignidad)\b/g,
  /\bno (quiere|quiero|quieren) vivir en (un|una) (asilo|residencia|hogar|hospital|centro)\b/g,
  // A brochure line: "what to do if your loved one says they want to die".
  /\b(si|if) (su|tu|your|a|their) (ser querido|loved one|familiar|family member|patient|paciente) (dice|says|said|dijo)( que| that)?( (he|she|they))? (quiere morir|wants to die|want to die)\b/g,
];
// What turns a hospice wish back into a crisis: a plan to die, a stash of pills, giving things away, "she's done".
const OTHER_CUE =
  /\b(tonight(?! if possible)|soon|(has|have|had|made) a plan|plans? to (kill|end|die|overdose)|planning to (kill|end|die|overdose)|(saved|saving|stockpiled|stockpiling|enough|all|bottle of|collecting|collected|hoarding|hoarded)( up)? (her |his |my |their )?(pills|meds|medication)|overdose|gun|rope|kill|end it|end my|bridge|jump|right now|knife|giving( \w+){0,2} away|gave( \w+){0,2} away|give( \w+){0,2} away|done|collect\w*|hoard\w*|stockpil\w*|matar\w*|esta noche|pronto)\b/;
// Leaving a job or a town, not life: "he won't be here much longer, he's retiring".
const LEAVING = /\b(retir\w*|moving|move|moved|new job|relocat\w*)\b/;
const NOT_AROUND = /\b(wont|will not|isnt going to|is not going to|not going to) be (around|here)( for)?( much)? longer\b/g;

function checkOne(text: string): CrisisResult {
  let spaced = FINALITY.test(text) ? text : IDIOMS.reduce((t, re) => t.replace(re, " "), text);
  if (!FINALITY.test(spaced) && !OTHER_CUE.test(spaced)) spaced = PEACEFUL_DEATH.reduce((t, re) => t.replace(re, " "), spaced);
  if (LEAVING.test(spaced) && !FINALITY.test(spaced)) spaced = spaced.replace(NOT_AROUND, " ");
  const personal = PERSONAL.some((re) => re.test(spaced));
  const squashed = spaced.replace(/ /g, "");
  // 1. Ideation, self-harm and direct danger: always crisis, whatever else is said.
  for (const category of Object.keys(SQUASHED) as CrisisCategory[]) {
    if (SQUASHED[category].some((s) => squashed.includes(s))) return { crisis: true, category };
    if (WORDS[category].some((re) => re.test(spaced))) return { crisis: true, category };
  }
  // Two warning signs, or one with a finality cue or a suicide word; two soft signs in end-of-life talk pass.
  const found = WARNING_SIGNS.filter((w) => w.re.test(spaced));
  const signs = found.length;
  if (signs > 0 && (FINALITY.test(spaced) || /suicid/.test(squashed) || (signs > 1 && (found.some((w) => w.hard) || !END_OF_LIFE.test(spaced))))) {
    return { crisis: true, category: "self_harm" };
  }
  if (nearMissKillSelf(spaced)) return { crisis: true, category: "self_harm" };
  // The book exemption on "want to disappear" holds only with no personal cue.
  if (personal && /\b(want to|wanna) disappear\b/.test(spaced)) return { crisis: true, category: "self_harm" };
  // 2. "Suicide": its topic phrases are dropped only in a practice context with no personal cue.
  const practice = !personal && SUICIDE_CONTEXTS.some((re) => re.test(spaced));
  const rest = practice ? spaced.replace(SUICIDE_TOPIC, " ") : spaced;
  if (rest.replace(/ /g, "").includes("suicid") || nearMissSuicide(rest)) return { crisis: true, category: "self_harm" };
  // 3. Danger topic words, unless that family's practice context is present and there is no personal cue.
  for (const topic of TOPICS) {
    if (topic.word.test(spaced) && (personal || !topic.contexts.some((re) => re.test(spaced)))) return { crisis: true, category: topic.category };
  }
  return { crisis: false };
}

// A note on a referral card describes the partner's office. There, a crisis word naming one of
// their services ("a suicide prevention program", "a self-harm IOP") can be a fact about the office.
// Default refuse: the service words are read as a fact ONLY when the note also has an office-fact
// word (runs, offers, meets, has a, waitlist, takes, refers, fax, staff, weekly, training, "for
// teens"...) AND no person cue at all (a name, my/I/me, needs, for <name>, a time like tonight or
// again, an attempt, a family word, a client or patient). Otherwise every word is read and it routes.
const NOTE_SERVICE =
  /\b(?:suicide|suicidal|self ?harm|self ?injury|self ?injurious|nssi)(?: and (?:suicide|suicidal|self ?harm|self ?injury))?(?: (?:prevention|loss|attempt|awareness|risk|and grief|bereavement))?(?: survivors?)? (?:program|programs|iop|iops|php|php s|clinic|clinics|training|trainings|group|groups|support group|support groups|services|service|team|track|curriculum|workshop|workshops|class|classes|specialists?|coordinator|counselors?)\b/g;
// An office phrase about who they serve: "refers families after a suicide loss".
const NOTE_OFFICE_PHRASE = /\b(?:after|following) (?:a |the )?suicide loss(?:es)?\b/g;
const NOTE_OFFICE_FACT =
  /\b(?:runs?|running|offers?|offering|meets?|meeting|has an?|have an?|waitlist|wait list|takes?|refer\w*|fax|staff|weekly|monthly|quarterly|free|training|trainings|for (?:teens|adults|families|staff|nurses|schools|kids|parents|caregivers|veterans|students|clinicians))\b/;
const NOTE_PERSON =
  /\b(?:client|clients|patient|patients|kid|kids|son|daughter|someone|somebody|man|woman|boy|girl|teen|caller|referral)\b|\b(?:she|he|they|her|him|them)( s)? (?:is|was|are|were|went|got|has been|have been|is being|been)\b/;
// Person cues, read on the note as typed (lower-cased words).
const NOTE_PERSON_WORDS =
  /\b(?:my \w+|i|i m|im|me|needs?|tonight|today|asap|now|right now|again|yesterday|last night|tried|sister|brother|husband|wife|mom|mother|dad|father|nephew|niece|friend|neighbou?r|veteran|student|his|hers)\b|\battempt(?!(?: survivors?)? (?:program|programs|group|groups|support group|support groups|team|services?|iop|php|clinic|track)\b)\w*/;
// Words that can be capitalized mid-sentence without being a person.
const NOTE_PLAIN_CAPS = new Set(
  "Monday Mondays Tuesday Tuesdays Wednesday Wednesdays Thursday Thursdays Friday Fridays Saturday Saturdays Sunday Sundays January February March April May June July August September October November December Medicaid Medicare Aetna Cigna BlueCross Blue Cross Shield Hospice Center Centre Hospital Clinic Health Healthcare Institute House Program Group Services Network Practice Care Society Foundation Alliance Counseling Wellness University College School Church".split(" "),
);
const NOTE_ORG = /\b(?:[A-Z][\w'’&.-]*\s+){1,5}(?:Center|Centre|Hospital|Clinic|Health|Healthcare|Institute|House|Program|Group|Associates|Partners|Services|Network|Practice|Care|Hospice|Society|Foundation|Alliance|Counseling|Wellness|University|College|Church|School)\b/g;
// Read in every note, whatever else it says.
const NOTE_ALWAYS = /\b(?:cutting again|tried again|(?:has|had|have) (?:\w+ )?(?:pills|meds|medication) saved|saved (?:up )?(?:pills|meds))\b/;

/** A capitalized word that isn't the first of its sentence, a day, a month, a payer, an org word or an acronym: someone's name. */
function namedInNote(text: string): boolean {
  for (const sentence of text.replace(NOTE_ORG, " org ").split(/[.;:!?\n]+/)) {
    const words = sentence.trim().split(/\s+/).filter(Boolean);
    for (const w of words.slice(1)) {
      const bare = w.replace(/[^A-Za-z'’-]/g, "").replace(/['’]s$/, "");
      if (!/^[A-Z][a-z]/.test(bare) || NOTE_PLAIN_CAPS.has(bare)) continue;
      return true;
    }
  }
  return false;
}

/** The note is plainly about the office's own service: an office-fact word and no person cue. */
function officeFactNote(text: string): boolean {
  const plain = text.toLowerCase().replace(/[’']/g, " ").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ");
  if (!NOTE_OFFICE_FACT.test(plain)) return false;
  if (NOTE_PERSON.test(plain) || NOTE_PERSON_WORDS.test(plain) || /\bfor [A-Z][a-z]+/.test(text) || namedInNote(text)) return false;
  return true;
}

function crisisIn(text: string, note: boolean): CrisisResult {
  const exempt = note && officeFactNote(text);
  for (const spaced of normalize(text)) {
    if (note && NOTE_ALWAYS.test(spaced)) return { crisis: true, category: "self_harm" };
    const read = exempt ? spaced.replace(NOTE_OFFICE_PHRASE, " ").replace(NOTE_SERVICE, " a program ") : spaced;
    const result = checkOne(read);
    if (result.crisis) return result;
  }
  return { crisis: false };
}

export function checkCrisis(text: string): CrisisResult {
  return crisisIn(text, false);
}

/** The crisis check for a note on a referral card (lib/referrals/contacts.ts checkNote): the office's own services are facts. */
export function checkNoteCrisis(text: string): CrisisResult {
  return crisisIn(text, true);
}

/**
 * The crisis check fired in the chat or on a file she added: the caller shows
 * CRISIS_REPLY, and this texts an urgent alert to her own verified phone and
 * writes both to audit_log (AGENTS.md > Approvals: the one path that skips
 * approvals). Never includes the words that triggered it. Front Desk has its own
 * caller-facing version (lib/frontdesk/crisis.ts) and shares the alert phone.
 */
export type CrisisSource = "chat" | "upload" | "media" | "referral_note";

export async function alertCrisis(input: { source: CrisisSource; category: CrisisCategory; by: string }): Promise<{ alerted: boolean }> {
  const { audit } = await import("./audit");
  const { alertPhone } = await import("./frontdesk/crisis");
  const { sendText } = await import("./frontdesk/store");
  await audit({ actor: "safety", action: "crisis_detected", subjectType: input.source, details: { category: input.category, by: input.by } });
  // Phone alerts are off (lib/features.ts): text no one; the urgent item at the top of Admin is the alert.
  const { PHONE_ALERTS_ENABLED, FRONT_DESK_ENABLED } = await import("./features");
  if (!PHONE_ALERTS_ENABLED && !FRONT_DESK_ENABLED) {
    await audit({ actor: "safety", action: "crisis_alert_failed", subjectType: input.source, details: { error: "phone alerts are off" } });
    return { alerted: false };
  }
  const to = await alertPhone().catch(() => null);
  if (!to) {
    await audit({ actor: "safety", action: "crisis_alert_failed", subjectType: input.source, details: { error: "no alert phone (settings.alert_phone or CLINICIAN_ALERT_PHONE)" } });
    return { alerted: false };
  }
  const what =
    input.source === "chat"
      ? "A message in your chat with Aeon"
      : input.source === "upload"
        ? "A file added in your chat with Aeon"
        : input.source === "referral_note"
          ? "A note typed on your Referrals board"
          : "Something typed on the Media page";
  try {
    await sendText({
      to,
      body: `URGENT from Practice-OS: ${what} mentioned danger or self-harm. Aeon showed the 988/911 message. Please check now.`,
      inquiryId: null,
      actor: "safety",
      action: "crisis_alert_sent",
      force: true,
    });
    return { alerted: true };
  } catch (e) {
    await audit({ actor: "safety", action: "crisis_alert_failed", subjectType: input.source, details: { error: String(e) } });
    return { alerted: false };
  }
}
