"""
Database configuration and setup for FlightHub.
"""

import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool, QueuePool

# Database URL
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./flighthub.db")

# SQLite: NullPool closes each connection after use so no pooled connection holds
# a write lock while another request tries to commit.
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {},
    poolclass=NullPool if "sqlite" in DATABASE_URL else QueuePool
)

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Declarative base for models
Base = declarative_base()


def get_db():
    """Dependency to get database session in FastAPI."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Initialize database tables."""
    Base.metadata.create_all(bind=engine)
