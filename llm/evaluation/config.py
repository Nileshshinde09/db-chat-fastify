
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from ..app.core.config import settings as app_settings


EVALUATION_DIR = Path(__file__).resolve().parent


class EvaluationSettings(BaseSettings):

    # Evaluation environment
    ENABLED: bool = True
    VERBOSE: bool = True

    # LLM judge configuration
    # Falls back to the application's ROUTER_MODEL
    JUDGE_MODEL: str = ""
    JUDGE_TEMPERATURE: float = Field(default=0.0, ge=0.0, le=2.0)

    # Dataset configuration
    DATASET_PATH: Path = (
        EVALUATION_DIR / "datasets" / "golden_dataset.json"
    )

    # Evaluation reports
    REPORTS_PATH: Path = EVALUATION_DIR / "reports"

    # Evaluation execution
    ASYNC_MODE: bool = False
    MAX_TEST_CASES: int = Field(default=100, ge=1, le=10000)

    # RAG metric thresholds
    ANSWER_RELEVANCY_THRESHOLD: float = Field(
        default=0.75, ge=0.0, le=1.0
    )

    FAITHFULNESS_THRESHOLD: float = Field(
        default=0.80, ge=0.0, le=1.0
    )

    CONTEXTUAL_PRECISION_THRESHOLD: float = Field(
        default=0.75, ge=0.0, le=1.0
    )

    CONTEXTUAL_RECALL_THRESHOLD: float = Field(
        default=0.75, ge=0.0, le=1.0
    )

    HALLUCINATION_THRESHOLD: float = Field(
        default=0.20, ge=0.0, le=1.0
    )

    # Dataset validation
    REQUIRE_EXPECTED_OUTPUT: bool = True
    REQUIRE_CONTEXT: bool = True

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="EVAL_",
        case_sensitive=True,
        extra="ignore",
    )

    @property
    def effective_judge_model(self) -> str:
        return self.JUDGE_MODEL or app_settings.ROUTER_MODEL

    @property
    def ollama_base_url(self) -> str:
        return app_settings.OLLAMA_BASE_URL


evaluation_settings = EvaluationSettings()
