"""
Application Configuration
==========================
Pydantic Settings class that reads from .env and validates
required API keys at startup (FR-2.10).
"""

from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict

# Project root: one level above Backend/
_PROJECT_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_PROJECT_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Required API keys
    ANTHROPIC_API_KEY: str
    OPENAI_API_KEY: str

    # Optional model configuration
    ADVANCE_LLM_MODEL: str = "claude-sonnet-4-20250514"

    # Directory configuration
    OUTPUT_DIR: str = "./output"
    INPUT_DIR: str = "./input"

    # Server configuration
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    def resolve_paths(self) -> None:
        """Resolve relative paths to absolute using project root as anchor."""
        input_path = Path(self.INPUT_DIR)
        output_path = Path(self.OUTPUT_DIR)

        if not input_path.is_absolute():
            input_path = _PROJECT_ROOT / input_path
        if not output_path.is_absolute():
            output_path = _PROJECT_ROOT / output_path

        self.INPUT_DIR = str(input_path.resolve())
        self.OUTPUT_DIR = str(output_path.resolve())

    def validate_directories(self) -> None:
        """Ensure input and output directories exist."""
        Path(self.INPUT_DIR).mkdir(parents=True, exist_ok=True)
        Path(self.OUTPUT_DIR).mkdir(parents=True, exist_ok=True)


def get_settings() -> Settings:
    """Load and validate settings. Raises clear error if keys are missing."""
    try:
        settings = Settings()
    except Exception as e:
        raise SystemExit(
            f"\n[ERROR] Missing required configuration.\n"
            f"Ensure your .env file contains:\n"
            f"  ANTHROPIC_API_KEY=sk-ant-...\n"
            f"  OPENAI_API_KEY=sk-proj-...\n\n"
            f"Detail: {e}"
        )
    settings.resolve_paths()
    settings.validate_directories()
    return settings
