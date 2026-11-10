from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, SecretStr


ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")

    knowra_data_dir: Path = ROOT / ".local"
    knowra_database_url: SecretStr = SecretStr("")
    knowra_database_schema: str = Field(default="public", pattern=r"^[a-z_][a-z0-9_]{0,62}$")
    knowra_database_pool_size: int = Field(default=10, ge=1, le=100)
    knowra_secret_key: SecretStr = SecretStr("")
    ai_base_url: str = ""
    ai_model: str = ""
    ai_api_key: str = ""
    knowra_ai_generation_effort: Literal["none", "low", "high"] = "none"
    knowra_public_url: str = "http://127.0.0.1:5173"
    knowra_tts_model_dir: Path | None = None
    knowra_tts_threads: int = 2
    tencent_tts_secret_id: str = ""
    tencent_tts_secret_key: str = ""
    tencent_tts_region: str = "ap-guangzhou"
    tencent_tts_voice_female: int = 101001
    tencent_tts_voice_male: int = 101004
    tencent_tts_model_type: int = 2
    tencent_tts_sample_rate: int = 16000
    tencent_tts_speed: float = 0.0
    knowra_asr_model_dir: Path | None = None
    knowra_asr_threads: int = Field(default=2, ge=1, le=8)

