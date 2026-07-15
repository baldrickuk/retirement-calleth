import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

const bedrock = new BedrockRuntimeClient({});
const ses = new SESClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const RETIREMENT_DATE = process.env.RETIREMENT_DATE as string;
const SENDER_EMAIL = process.env.SENDER_EMAIL as string;
const RECIPIENT_EMAIL = process.env.RECIPIENT_EMAIL as string;
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID as string;
const TABLE_NAME = process.env.TABLE_NAME as string;
const HISTORY_KEY = "HISTORY";
const MAX_HISTORY = 10;

function daysLeft(): number {
  const today = new Date();
  const target = new Date(`${RETIREMENT_DATE}T00:00:00Z`);
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const diffMs = target.getTime() - todayUtc;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function toneForDays(n: number): string {
  if (n > 365) return "dry, understated, barely-amused corporate tone. A single restrained joke at most.";
  if (n > 100) return "noticeably cheekier, gentle countdown humor, a bit of a smirk.";
  if (n > 30) return "unhinged office-countdown energy, playful exaggeration, mock-desperate.";
  if (n > 7) return "chaotic, escalating absurdity, all-caps and exclamation marks welcome.";
  if (n > 0) return "peak celebratory chaos, over-the-top excitement, confetti-emoji energy.";
  return "today is the day — triumphant, warm, a little emotional, congratulatory.";
}

async function getRecentJokes(): Promise<string[]> {
  const res = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { date: HISTORY_KEY } }));
  return (res.Item?.jokes as string[]) ?? [];
}

async function saveJoke(joke: string, recent: string[]): Promise<void> {
  const updated = [...recent, joke].slice(-MAX_HISTORY);
  await ddb.send(
    new PutCommand({ TableName: TABLE_NAME, Item: { date: HISTORY_KEY, jokes: updated } })
  );
  // Also keep a per-day record for 90 days, handy for debugging
  const ttl = Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60;
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: { date: new Date().toISOString().slice(0, 10), joke, ttl },
    })
  );
}

async function generateJoke(days: number, recentJokes: string[]): Promise<string> {
  const tone = toneForDays(days);
  const avoid = recentJokes.length
    ? `Avoid repeating the style or punchline of these recent messages:\n${recentJokes
        .map((j) => `- ${j}`)
        .join("\n")}`
    : "";

  const systemPrompt =
    "You write short, funny daily countdown emails for someone counting down to their retirement. " +
    "Keep it to 2-4 sentences. Be genuinely funny, not corny. No hashtags.";

  const userPrompt =
    `Days remaining until retirement: ${days}. ` +
    `Tone for today: ${tone} ${avoid}`;

  const command = new InvokeModelCommand({
    modelId: BEDROCK_MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  const response = await bedrock.send(command);
  const payload = JSON.parse(new TextDecoder().decode(response.body));
  return payload.content?.[0]?.text?.trim() ?? "Countdown joke generator took the day off.";
}

async function sendEmail(days: number, body: string): Promise<void> {
  const subject =
    days > 0 ? `${days} day${days === 1 ? "" : "s"} until retirement` : "🎉 Today's the day!";

  await ses.send(
    new SendEmailCommand({
      Source: SENDER_EMAIL,
      Destination: { ToAddresses: [RECIPIENT_EMAIL] },
      Message: {
        Subject: { Data: subject },
        Body: { Text: { Data: body } },
      },
    })
  );
}

export async function handler(): Promise<void> {
  const days = daysLeft();
  const recentJokes = await getRecentJokes();
  const joke = await generateJoke(days, recentJokes);

  await sendEmail(days, joke);
  await saveJoke(joke, recentJokes);
}
