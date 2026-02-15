import json
from fastapi import FastAPI, Depends, HTTPException, Request
# ... (rest of imports)

from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

from database import engine, get_db, Base
from models import JobApplication

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Job Application Tracker")

# CORS — allow extension and localhost
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files & templates
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


# ---------- Pydantic Schemas ----------

class JobCreate(BaseModel):
    job_title: str
    company: Optional[str] = None
    description: Optional[str] = None
    url: Optional[str] = None


class JobUpdate(BaseModel):
    job_title: Optional[str] = None
    company: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    url: Optional[str] = None


class JobResponse(BaseModel):
    id: int
    job_title: str
    company: Optional[str]
    description: Optional[str]
    status: str
    applied_date: datetime
    url: Optional[str]

    model_config = {"from_attributes": True}


# ---------- API Endpoints ----------

@app.post("/api/jobs", response_model=JobResponse)
def create_job(job: JobCreate, db: Session = Depends(get_db)):
    db_job = JobApplication(
        job_title=job.job_title,
        company=job.company,
        description=job.description,
        url=job.url,
        status="Applied",
        applied_date=datetime.now(timezone.utc),
    )
    db.add(db_job)
    db.commit()
    db.refresh(db_job)
    return db_job


@app.get("/api/jobs", response_model=list[JobResponse])
def list_jobs(status: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(JobApplication)
    if status:
        query = query.filter(JobApplication.status == status)
    return query.order_by(JobApplication.applied_date.desc()).all()


@app.get("/api/jobs/{job_id}", response_model=JobResponse)
def get_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(JobApplication).filter(JobApplication.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@app.patch("/api/jobs/{job_id}", response_model=JobResponse)
def update_job(job_id: int, job_update: JobUpdate, db: Session = Depends(get_db)):
    job = db.query(JobApplication).filter(JobApplication.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    update_data = job_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(job, key, value)

    db.commit()
    db.refresh(job)
    return job


@app.delete("/api/jobs/{job_id}")
def delete_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(JobApplication).filter(JobApplication.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    db.delete(job)
    db.commit()
    return {"detail": "Job deleted"}


# ---------- Dashboard HTML ----------

@app.get("/", response_class=HTMLResponse)
def dashboard(request: Request, db: Session = Depends(get_db)):
    jobs = db.query(JobApplication).order_by(JobApplication.applied_date.desc()).all()

    statuses = ["Applied", "Interview", "Offered", "Declined", "Rejected"]
    columns = {s: [j for j in jobs if j.status == s] for s in statuses}

    status_colors = {
        "Applied": "#F5D5A8",
        "Interview": "#74B9FF",
        "Offered": "#6BCB77",
        "Declined": "#E87171",
        "Rejected": "#B0B0B0",
    }

    return templates.TemplateResponse(
        "dashboard.html",
        {
            "request": request,
            "columns": columns,
            "statuses": statuses,
            "status_colors": status_colors,
            "total": len(jobs),
        },
    )


@app.get("/applications", response_class=HTMLResponse)
def all_applications(request: Request, db: Session = Depends(get_db)):
    jobs = db.query(JobApplication).order_by(JobApplication.applied_date.desc()).all()

    status_colors = {
        "Applied": "#F5D5A8",
        "Interview": "#74B9FF",
        "Offered": "#6BCB77",
        "Declined": "#E87171",
        "Rejected": "#B0B0B0",
    }

    return templates.TemplateResponse(
        "applications.html",
        {
            "request": request,
            "jobs": jobs,
            "status_colors": status_colors,
            "total": len(jobs),
        },
    )


@app.get("/rejections", response_class=HTMLResponse)
def rejections_view(request: Request, db: Session = Depends(get_db)):
    # Filter for Rejected and ghosted (No Response isn't a status yet, so maybe just Rejected and Declined)
    jobs = db.query(JobApplication).filter(JobApplication.status.in_(["Rejected", "Declined"])).order_by(JobApplication.applied_date.desc()).all()

    return templates.TemplateResponse(
        "rejections.html",
        {
            "request": request,
            "jobs": jobs,
            "total": len(jobs),
        },
    )


@app.get("/analytics", response_class=HTMLResponse)
def analytics_view(request: Request, db: Session = Depends(get_db)):
    jobs = db.query(JobApplication).all()

    total_applied = len(jobs)
    
    # Calculate counts per status
    status_counts = {}
    for job in jobs:
        status_counts[job.status] = status_counts.get(job.status, 0) + 1
    
    # Calculate response rate (Interviews + Offers) / Total
    interviews = status_counts.get("Interview", 0) + status_counts.get("Offered", 0)
    response_rate = round((interviews / total_applied * 100) if total_applied > 0 else 0, 1)

    # Active processes
    active_processes = interviews

    # Timeline data (last 30 days usually, but here all time for simplicity)
    timeline_counts = {}
    for job in jobs:
        date_str = job.applied_date.strftime("%Y-%m-%d")
        timeline_counts[date_str] = timeline_counts.get(date_str, 0) + 1
    
    # Sort timeline by date
    sorted_timeline = dict(sorted(timeline_counts.items()))

    return templates.TemplateResponse(
        "analytics.html",
        {
            "request": request,
            "total_applied": total_applied,
            "response_rate": response_rate,
            "active_processes": active_processes,
            "status_counts": status_counts,
            "timeline_counts": sorted_timeline,
        },
    )

@app.get("/analytics", response_class=HTMLResponse)
def analytics_view(request: Request, db: Session = Depends(get_db)):
    jobs = db.query(JobApplication).all()

    total_applied = len(jobs)
    
    # Calculate counts per status
    status_counts = {}
    for job in jobs:
        status_counts[job.status] = status_counts.get(job.status, 0) + 1
    
    # Calculate response rate (Interviews + Offers) / Total
    interviews = status_counts.get("Interview", 0) + status_counts.get("Offered", 0)
    response_rate = round((interviews / total_applied * 100) if total_applied > 0 else 0, 1)

    # Active processes
    active_processes = interviews

    # Timeline data (last 30 days usually, but here all time for simplicity)
    timeline_counts = {}
    for job in jobs:
        date_str = job.applied_date.strftime("%Y-%m-%d")
        timeline_counts[date_str] = timeline_counts.get(date_str, 0) + 1
    
    # Sort timeline by date
    sorted_timeline = dict(sorted(timeline_counts.items()))

    return templates.TemplateResponse(
        "analytics.html",
        {
            "request": request,
            "total_applied": total_applied,
            "response_rate": response_rate,
            "active_processes": active_processes,
            "status_counts": json.dumps(status_counts),
            "timeline_counts": json.dumps(sorted_timeline),
        },
    )
