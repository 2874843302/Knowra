"""Tencent Cloud TextToVoice provider with TC3-HMAC-SHA256 signing."""
import base64
import hashlib
import hmac
import io
import json
import logging
import re
import time
import uuid
import wave

import httpx

logger = logging.getLogger(__name__)

HOST = "tts.tencentcloudapi.com"
SERVICE = "tts"
VERSION = "2019-08-23"
CONTENT_TYPE = "application/json; charset=utf-8"


class TencentTTSError(Exception):
    pass


def _hmac(key, message):
    return hmac.new(key, message.encode("utf-8"), hashlib.sha256).digest()


def _chunks(text, limit=140):
    while len(text) > limit:
        boundaries = [
            match.end()
            for match in re.finditer(r"[。！？；，!?;,]|\s+", text[:limit])
            if match.end() >= limit // 2
        ]
        end = boundaries[-1] if boundaries else limit
        yield text[:end]
        text = text[end:]
    if text:
        yield text


class TencentTTS:
    def __init__(self, settings):
        self.secret_id = (settings.tencent_tts_secret_id or "").strip()
        self.secret_key = (settings.tencent_tts_secret_key or "").strip()
        self.region = (settings.tencent_tts_region or "ap-guangzhou").strip()
        self.voice_types = {
            "tencent-female": int(settings.tencent_tts_voice_female),
            "tencent-male": int(settings.tencent_tts_voice_male),
        }
        self.model_type = int(settings.tencent_tts_model_type)
        self.sample_rate = int(settings.tencent_tts_sample_rate)
        self.speed = float(settings.tencent_tts_speed)

    def ready(self):
        return bool(self.secret_id and self.secret_key)

    def synthesize(self, text, voice):
        if not self.ready():
            raise TencentTTSError("腾讯云语音尚未配置 SecretId/SecretKey。")
        voice_type = self.voice_types.get(voice)
        if voice_type is None:
            raise TencentTTSError("不支持的腾讯云音色。")
        audio = [self._request(chunk, voice_type) for chunk in _chunks(text)]
        return self._merge(audio)

    def _request(self, text, voice_type):
        payload = {
            "Text": text,
            "SessionId": uuid.uuid4().hex,
            "VoiceType": voice_type,
            "ModelType": self.model_type,
            "Speed": self.speed,
            "Volume": 0,
            "ProjectId": 0,
            "PrimaryLanguage": 1,
            "SampleRate": self.sample_rate,
            "Codec": "wav",
        }
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        timestamp = int(time.time())
        headers = self._headers(body, timestamp)
        try:
            response = httpx.post(f"https://{HOST}", headers=headers, content=body, timeout=30)
        except httpx.HTTPError as error:
            raise TencentTTSError("无法连接腾讯云语音服务，请检查网络。") from error
        if response.status_code != 200:
            raise TencentTTSError(f"腾讯云语音服务返回 {response.status_code}，请稍后重试。")
        try:
            value = response.json()["Response"]
        except (ValueError, KeyError, TypeError):
            raise TencentTTSError("腾讯云语音返回结构不正确。")
        if isinstance(value.get("Error"), dict):
            raise TencentTTSError(self._error_message(value["Error"]))
        audio = value.get("Audio")
        if not isinstance(audio, str) or not audio:
            raise TencentTTSError("腾讯云语音没有返回音频。")
        try:
            return base64.b64decode(audio)
        except ValueError:
            raise TencentTTSError("腾讯云语音返回的音频编码无效。")

    @staticmethod
    def _error_message(error):
        code = str(error.get("Code") or "")
        logger.warning("Tencent TTS error: %s %s", code, error.get("Message"))
        exact = {
            "InvalidParameterValue.AppId": "腾讯云 AppId 不可用，请检查账号和密钥。",
            "InvalidParameterValue.AppIdNotRegistered": "腾讯云语音合成尚未开通，请在腾讯云控制台语音合成主页开通使用。",
            "InvalidParameterValue.ModelType": "腾讯云模型类型与音色不匹配，请设置 TENCENT_TTS_MODEL_TYPE=2（精品音色）。",
            "InvalidParameterValue.VoiceType": "腾讯云音色编号不可用，请检查 TENCENT_TTS_VOICE_FEMALE/MALE。",
            "InvalidParameterValue.Text": "讲解文本不符合腾讯云限制（中文 150 字、英文 500 字母）。",
            "InvalidParameterValue.SampleRate": "腾讯云当前音色不支持这个采样率，请设置 TENCENT_TTS_SAMPLE_RATE=16000。",
            "MissingParameter": "腾讯云语音请求缺少必要参数。",
        }
        if code in exact:
            return exact[code]
        if code.startswith("AuthFailure") or code in {"UnauthorizedOperation", "InvalidCredential"}:
            return "腾讯云语音鉴权失败，请检查 SecretId、SecretKey 和接口权限。"
        if code == "RequestLimitExceeded":
            return "腾讯云语音请求过于频繁，请稍后重试。"
        if code.startswith("InvalidParameter"):
            return f"腾讯云语音参数不正确（{code}）。"
        return f"腾讯云语音合成失败（{code or '未知错误'}）。"

    def _headers(self, body, timestamp):
        date = time.strftime("%Y-%m-%d", time.gmtime(timestamp))
        canonical_headers = (
            f"content-type:{CONTENT_TYPE}\n"
            f"host:{HOST}\n"
            "x-tc-action:texttovoice\n"
        )
        signed_headers = "content-type;host;x-tc-action"
        hashed_payload = hashlib.sha256(body).hexdigest()
        canonical_request = (
            f"POST\n/\n\n{canonical_headers}\n"
            f"{signed_headers}\n{hashed_payload}"
        )
        scope = f"{date}/{SERVICE}/tc3_request"
        string_to_sign = (
            f"TC3-HMAC-SHA256\n{timestamp}\n{scope}\n"
            f"{hashlib.sha256(canonical_request.encode('utf-8')).hexdigest()}"
        )
        secret_date = _hmac(("TC3" + self.secret_key).encode("utf-8"), date)
        secret_service = _hmac(secret_date, SERVICE)
        secret_signing = _hmac(secret_service, "tc3_request")
        signature = hmac.new(
            secret_signing, string_to_sign.encode("utf-8"), hashlib.sha256
        ).hexdigest()
        authorization = (
            f"TC3-HMAC-SHA256 Credential={self.secret_id}/{scope}, "
            f"SignedHeaders={signed_headers}, Signature={signature}"
        )
        return {
            "Authorization": authorization,
            "Content-Type": CONTENT_TYPE,
            "Host": HOST,
            "X-TC-Action": "TextToVoice",
            "X-TC-Timestamp": str(timestamp),
            "X-TC-Version": VERSION,
            "X-TC-Region": self.region,
        }

    @staticmethod
    def _merge(audio_parts):
        if not audio_parts:
            raise TencentTTSError("腾讯云语音没有返回音频。")
        if len(audio_parts) == 1:
            return audio_parts[0]
        frames = []
        params = None
        for data in audio_parts:
            with wave.open(io.BytesIO(data), "rb") as audio:
                current = audio.getparams()
                if params is None:
                    params = current
                elif (
                    current.nchannels != params.nchannels
                    or current.sampwidth != params.sampwidth
                    or current.framerate != params.framerate
                ):
                    raise TencentTTSError("腾讯云语音分段音频格式不一致。")
                frames.append(audio.readframes(audio.getnframes()))
        output = io.BytesIO()
        with wave.open(output, "wb") as audio:
            audio.setnchannels(params.nchannels)
            audio.setsampwidth(params.sampwidth)
            audio.setframerate(params.framerate)
            audio.writeframes(b"".join(frames))
        return output.getvalue()