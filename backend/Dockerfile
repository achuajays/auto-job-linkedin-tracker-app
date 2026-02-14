# Use an official Python runtime as a parent image
FROM python:3.11-slim-bookworm

# Set the working directory in the container
WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Copy the project configuration files
COPY pyproject.toml uv.lock ./

# Install dependencies
# --frozen: use uv.lock
# --no-install-project: only install dependencies first (caching layer)
RUN uv sync --frozen --no-install-project

# Copy the application code
COPY . .

# Install the project itself (if applicable, otherwise ensures venv is ready)
RUN uv sync --frozen

# Expose port 8000
EXPOSE 8000

# Run the application
# We use `uv run` to execute in the environment created by `uv sync`
CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
