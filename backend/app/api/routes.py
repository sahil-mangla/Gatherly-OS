"""FastAPI routes for Gatherly API endpoints."""

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from ..domain.risks import evaluate_event_risks
from ..domain.simulation import simulate_ripple
from ..domain.vendors import compare_quotes, extract_quote_from_raw_text
from ..services.mara_service import query_mara_copilot
from .schemas import MaraRequest, MaraResponse, QuoteParseRequest, SimulationRequest

router = APIRouter(prefix="/api")


class QuotesListRequest(BaseModel):
    quotes: list[dict[str, Any]]


class EventPayloadRequest(BaseModel):
    event: dict[str, Any]
    ref_date: str | None = None


@router.get("/health")
def health_check() -> dict[str, Any]:
    """Health check endpoint."""
    return {
        "status": "ok",
        "service": "gatherly-backend",
        "version": "1.0.0",
    }


@router.post("/mara", response_model=MaraResponse)
def mara_endpoint(req: MaraRequest) -> Any:
    """Mara GenAI Copilot endpoint."""
    result = query_mara_copilot(req.operation, req.prompt, req.context)
    return result


@router.post("/simulate")
def simulate_endpoint(req: SimulationRequest) -> dict[str, Any]:
    """Execute multi-domain ripple simulation."""
    return simulate_ripple(
        req.event,
        {
            "guest_delta": req.guest_delta,
            "catering_variance_pct": req.catering_variance_pct,
        },
    )


@router.post("/vendors/compare")
def compare_quotes_endpoint(req: QuotesListRequest) -> dict[str, Any]:
    """Compare multiple vendor quotes side-by-side."""
    return compare_quotes(req.quotes)


@router.post("/vendors/parse-seed")
def parse_quote_seed_endpoint(req: QuoteParseRequest) -> dict[str, Any]:
    """Extract structured quote parameters from raw text."""
    extracted = extract_quote_from_raw_text(req.text)
    return {"success": True, "extracted_quote": extracted}


@router.post("/risks")
def evaluate_risks_endpoint(req: EventPayloadRequest) -> dict[str, Any]:
    """Evaluate deterministic risk radar for an event."""
    return evaluate_event_risks(req.event, req.ref_date)
