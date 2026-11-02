from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")

    knowra_data_dir: Path = ROOT / ".local"
    ai_base_url: str = ""
    ai_model: str = ""
    ai_api_key: str = ""
    knowra_public_url: str = "http://127.0.0.1:5173"
    knowra_tts_model_dir: Path | None = None
    knowra_tts_threads: int = 2

