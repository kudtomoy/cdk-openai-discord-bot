import os
import logging
import json
import re
import time

import boto3
import openai
import discord


# Logger の設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Parameter Store から Secrets を取得
ssm_client = boto3.client("ssm")
ssm_response = ssm_client.get_parameters(
    Names=["/openai-discord-bot/discord-token", "/openai-discord-bot/openai-secret"],
    WithDecryption=True,
)

DISCORD_TOKEN = ssm_response["Parameters"][0]["Value"]
openai.api_key = ssm_response["Parameters"][1]["Value"]
CHARACTER_SETTING = os.environ["CHARACTER_SETTING"].strip()

intents = discord.Intents.default()
intents.typing = False
discord_client = discord.Client(intents=intents)


def fetch_completion(messages: list, retries: int = 2) -> str:
    messages.insert(0, {"role": "system", "content": CHARACTER_SETTING})

    for i in range(retries + 1):
        try:
            res = openai.ChatCompletion.create(model="gpt-3.5-turbo", messages=messages)
            res_context = res["choices"][0]["message"]["content"]

            logger.info("OpenAI response: " + json.dumps(res, ensure_ascii=False))

            return res_context
        except openai.error.OpenAIError as e:
            logger.warning(e)
            if i < retries:
                time.sleep(2**i)  # exponential backoff
                continue
            else:
                return str(e)


def get_role(author) -> str:
    if author == discord_client.user:
        return "assistant"
    else:
        return "user"


def clean_message(message: str) -> str:
    # Mention などの不要な文字を削除する
    return re.sub(r"<@\d+>", "", message).strip()


@discord_client.event
async def on_message(message):
    if not (
        discord_client.user.mentioned_in(message)
        and message.author != discord_client.user
    ):
        return

    if message.reference:
        # リプライツリーがある場合、さかのぼってログを取得する
        referenced_message = await message.channel.fetch_message(
            message.reference.message_id
        )
        messages = []

        messages.append(
            {
                "role": get_role(referenced_message.author),
                "content": clean_message(referenced_message.content),
            }
        )

        referenced_message = referenced_message.reference
        while referenced_message is not None:
            referenced_message = await message.channel.fetch_message(
                referenced_message.message_id
            )
            messages.append(
                {
                    "role": get_role(referenced_message.author),
                    "content": clean_message(referenced_message.content),
                }
            )
            referenced_message = referenced_message.reference
        messages.reverse()
        messages.append(
            {
                "role": get_role(message.author),
                "content": clean_message(message.content),
            }
        )
        messages.append({"role": "user", "content": message.content})
        response = fetch_completion(messages)
        await message.channel.send(response, reference=message)

    else:
        # リプライツリーがない場合
        response = fetch_completion([{"role": "user", "content": message.content}])
        await message.channel.send(response, reference=message)


if __name__ == "__main__":
    discord_client.run(DISCORD_TOKEN)
