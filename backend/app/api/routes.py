"""FastAPI routes for Gatherly API endpoints."""

from typing import Annotated, Any

from fastapi import APIRouter, Depends

from ..auth.dependencies import AuthContext
from ..domain.risks import evaluate_event_risks
from ..domain.simulation import simulate_ripple
from ..domain.vendors import compare_quotes, extract_quote_from_raw_text
from ..services.mara_service import query_mara_copilot
from .rate_limit import limit_by_user
from .schemas import (
    EventPayloadRequest,
    MaraRequest,
    MaraResponse,
    QuoteParseRequest,
    QuotesListRequest,
    SimulationRequest,
)

router = APIRouter(prefix="/api")

MaraUser = Annotated[AuthContext, Depends(limit_by_user("mara", 30))]
ComputeUser = Annotated[AuthContext, Depends(limit_by_user("compute", 120))]


@router.get("/health")
def health_check() -> dict[str, Any]:
    """Health check endpoint."""
    return {
        "status": "ok",
        "service": "gatherly-backend",
        "version": "1.0.0",
    }


@router.post("/mara", response_model=MaraResponse)
def mara_endpoint(req: MaraRequest, _auth: MaraUser) -> Any:
    """Mara GenAI Copilot endpoint (authenticated, 30 requests/minute)."""
    return query_mara_copilot(req.operation, req.prompt, req.context)


@router.post("/simulate")
def simulate_endpoint(req: SimulationRequest, _auth: ComputeUser) -> dict[str, Any]:
    """Execute multi-domain ripple simulation."""
    return simulate_ripple(
        req.event,
        {
            "guest_delta": req.guest_delta,
            "catering_variance_pct": req.catering_variance_pct,
        },
    )


@router.post("/vendors/compare")
def compare_quotes_endpoint(req: QuotesListRequest, _auth: ComputeUser) -> dict[str, Any]:
    """Compare multiple vendor quotes side-by-side."""
    return compare_quotes(req.quotes)


@router.post("/vendors/parse-seed")
def parse_quote_seed_endpoint(req: QuoteParseRequest, _auth: ComputeUser) -> dict[str, Any]:
    """Extract structured quote parameters from raw text."""
    extracted = extract_quote_from_raw_text(req.text)
    return {"success": True, "extracted_quote": extracted}


@router.post("/risks")
def evaluate_risks_endpoint(req: EventPayloadRequest, _auth: ComputeUser) -> dict[str, Any]:
    """Evaluate deterministic risk radar for an event."""
    return evaluate_event_risks(req.event, req.ref_date)
