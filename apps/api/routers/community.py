"""
Community / Civic Wikipedia API.

Endpoints for submitting and corroborating civic facts.
Citizens contribute what they know; others press + to verify.

Trust tiers:
  official           -> green  (source_type = 'official')
  rti                -> blue   (source_type = 'rti')
  community_verified -> amber  (community + corroborations >= 5)
  unverified         -> grey   (community + corroborations < 5)
  disputed           -> red    (dispute_count > corroboration_count and >= 3)
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import SessionLocal
from ..models import CommunityFact, FactVote
from ..schemas import (
    CommunityFactRead,
    SubmitFactRequest,
    SubmitFactResponse,
    VoteRequest,
    VoteResponse,
)

router = APIRouter(prefix="/community", tags=["community"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _trust_level(fact: CommunityFact) -> str:
    if fact.source_type == "official":
        return "official"
    if fact.source_type == "rti":
        return "rti"
    if fact.dispute_count > fact.corroboration_count and fact.dispute_count >= 3:
        return "disputed"
    if fact.corroboration_count >= 5:
        return "community_verified"
    return "unverified"


def _serialise(fact: CommunityFact) -> CommunityFactRead:
    return CommunityFactRead(
        id=fact.id,
        city_id=fact.city_id,
        ward_no=fact.ward_no,
        category=fact.category,
        subject=fact.subject,
        field=fact.field,
        value=fact.value,
        source_type=fact.source_type,
        source_url=fact.source_url,
        source_note=fact.source_note,
        corroboration_count=fact.corroboration_count,
        dispute_count=fact.dispute_count,
        trust_level=_trust_level(fact),
        created_at=fact.created_at.isoformat() if fact.created_at else "",
        last_corroborated_at=(
            fact.last_corroborated_at.isoformat() if fact.last_corroborated_at else None
        ),
    )


async def get_db():
    async with SessionLocal() as session:
        yield session


# ---------------------------------------------------------------------------
# GET /community/facts
# ---------------------------------------------------------------------------

@router.get("/facts", response_model=list[CommunityFactRead])
async def get_facts(
    ward_no: int | None = Query(default=None),
    city_id: str = Query(default="bengaluru"),
    category: str | None = Query(default=None, description="Filter by category e.g. 'officer'"),
    db: AsyncSession = Depends(get_db),
):
    """
    Fetch community facts for a ward, ordered by trust (most corroborated first).
    Returns an empty list if none found — never crashes the frontend.
    """
    try:
        q = (
            select(CommunityFact)
            .where(
                CommunityFact.city_id == city_id,
                CommunityFact.is_active.is_(True),
            )
            .order_by(
                CommunityFact.corroboration_count.desc(),
                CommunityFact.created_at.desc(),
            )
        )
        if ward_no is not None:
            q = q.where(CommunityFact.ward_no == ward_no)
        if category:
            q = q.where(CommunityFact.category == category)

        result = await db.execute(q)
        facts = result.scalars().all()
        return [_serialise(f) for f in facts]
    except Exception:
        return []


# ---------------------------------------------------------------------------
# POST /community/facts
# ---------------------------------------------------------------------------

@router.post("/facts", response_model=SubmitFactResponse, status_code=201)
async def submit_fact(
    body: SubmitFactRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Submit a new civic fact.

    Checks for duplicate: same (city_id, ward_no, category, subject, field, value).
    If an exact duplicate exists, auto-corroborates if a contributor_token is provided.
    """
    # Check for exact duplicate
    dup_q = select(CommunityFact).where(
        CommunityFact.city_id == body.city_id,
        CommunityFact.ward_no == body.ward_no,
        CommunityFact.category == body.category,
        CommunityFact.subject == body.subject,
        CommunityFact.field == body.field,
        CommunityFact.value == body.value,
        CommunityFact.is_active.is_(True),
    )
    existing = (await db.execute(dup_q)).scalar_one_or_none()

    if existing:
        # Auto-corroborate if token provided and hasn't voted before
        if body.contributor_token:
            vote_q = select(FactVote).where(
                FactVote.fact_id == existing.id,
                FactVote.voter_token == body.contributor_token,
            )
            has_voted = (await db.execute(vote_q)).scalar_one_or_none()
            if not has_voted:
                db.add(FactVote(
                    fact_id=existing.id,
                    vote_type="corroborate",
                    voter_token=body.contributor_token,
                ))
                existing.corroboration_count += 1
                await db.commit()
                await db.refresh(existing)

        return SubmitFactResponse(ok=True, fact=_serialise(existing), is_duplicate=True)

    # Create new fact — submitter's token counts as the first corroboration
    initial_count = 1 if body.contributor_token else 0
    fact = CommunityFact(
        city_id=body.city_id,
        ward_no=body.ward_no,
        category=body.category,
        subject=body.subject,
        field=body.field,
        value=body.value,
        source_type=body.source_type,
        source_url=body.source_url,
        source_note=body.source_note,
        contributor_token=body.contributor_token,
        corroboration_count=initial_count,
        dispute_count=0,
        is_active=True,
    )
    db.add(fact)
    await db.flush()  # get the id

    if body.contributor_token:
        db.add(FactVote(
            fact_id=fact.id,
            vote_type="corroborate",
            voter_token=body.contributor_token,
        ))

    await db.commit()
    await db.refresh(fact)
    return SubmitFactResponse(ok=True, fact=_serialise(fact), is_duplicate=False)


# ---------------------------------------------------------------------------
# POST /community/facts/{fact_id}/vote
# ---------------------------------------------------------------------------

@router.post("/facts/{fact_id}/vote", response_model=VoteResponse)
async def vote_on_fact(
    fact_id: int,
    body: VoteRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Cast a corroborate (+) or dispute vote on a fact.

    Each voter_token can vote once per fact. Returns already_voted=True if
    they've already voted (idempotent — safe to call multiple times).
    """
    if body.vote_type not in ("corroborate", "dispute"):
        raise HTTPException(status_code=400, detail="vote_type must be 'corroborate' or 'dispute'")

    fact_q = select(CommunityFact).where(
        CommunityFact.id == fact_id,
        CommunityFact.is_active.is_(True),
    )
    fact = (await db.execute(fact_q)).scalar_one_or_none()
    if not fact:
        raise HTTPException(status_code=404, detail="Fact not found")

    # Check if already voted
    vote_q = select(FactVote).where(
        FactVote.fact_id == fact_id,
        FactVote.voter_token == body.voter_token,
    )
    existing_vote = (await db.execute(vote_q)).scalar_one_or_none()

    if existing_vote:
        return VoteResponse(
            ok=True,
            fact_id=fact_id,
            corroboration_count=fact.corroboration_count,
            dispute_count=fact.dispute_count,
            trust_level=_trust_level(fact),
            already_voted=True,
        )

    # Record vote and update counter
    db.add(FactVote(
        fact_id=fact_id,
        vote_type=body.vote_type,
        voter_token=body.voter_token,
    ))

    if body.vote_type == "corroborate":
        fact.corroboration_count += 1
    else:
        fact.dispute_count += 1

    await db.commit()
    await db.refresh(fact)

    return VoteResponse(
        ok=True,
        fact_id=fact_id,
        corroboration_count=fact.corroboration_count,
        dispute_count=fact.dispute_count,
        trust_level=_trust_level(fact),
        already_voted=False,
    )
