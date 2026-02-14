from sqlalchemy import Column, Integer, String, DateTime
from datetime import datetime, timezone
from database import Base


class JobApplication(Base):
    __tablename__ = "job_applications"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    job_title = Column(String, nullable=False)
    company = Column(String, nullable=True)
    description = Column(String, nullable=True)
    status = Column(String, default="Applied")
    applied_date = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    url = Column(String, nullable=True)
