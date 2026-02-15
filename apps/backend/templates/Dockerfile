FROM public.ecr.aws/docker/library/python:3.12-slim

# Add Lambda Web Adapter
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 /lambda-adapter /opt/extensions/lambda-adapter

WORKDIR /app

# User environment variables (injected at deploy time)
{{USER_ARGS}}

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    make \
    curl \
    libpq-dev \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy everything
COPY . .

# Universal dependency installation
RUN set -e && \
    echo "=== Detecting package manager ===" && \
    if [ -f "uv.lock" ]; then \
        echo "uv detected" && \
        curl -LsSf https://astral.sh/uv/install.sh | sh && \
        export PATH="$HOME/.local/bin:$PATH" && \
        uv sync --no-dev; \
    elif [ -f "poetry.lock" ]; then \
        echo "Poetry detected" && \
        pip install --no-cache-dir poetry && \
        poetry config virtualenvs.create false && \
        poetry install --only main --no-interaction; \
    elif [ -f "Pipfile.lock" ]; then \
        echo "Pipenv detected" && \
        pip install --no-cache-dir pipenv && \
        pipenv install --system --deploy --ignore-pipfile; \
    elif [ -f "pyproject.toml" ]; then \
        if grep -q "\[tool.poetry\]" pyproject.toml 2>/dev/null; then \
            echo "Poetry (pyproject.toml) detected" && \
            pip install --no-cache-dir poetry && \
            poetry config virtualenvs.create false && \
            poetry install --only main --no-interaction; \
        else \
            echo "PEP 621 detected" && \
            pip install --no-cache-dir .; \
        fi; \
    elif [ -f "requirements.txt" ]; then \
        echo "pip detected" && \
        pip install --no-cache-dir -r requirements.txt; \
    elif [ -f "requirements/prod.txt" ]; then \
        echo "pip (prod) detected" && \
        pip install --no-cache-dir -r requirements/prod.txt; \
    elif [ -f "setup.py" ]; then \
        echo "setup.py detected" && \
        pip install --no-cache-dir .; \
    else \
        echo "No dependency file found"; \
    fi && \
    pip install --no-cache-dir uvicorn gunicorn 2>/dev/null || true && \
    echo "=== Done ==="

# Environment
ENV PORT=8080
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV AWS_LWA_INVOKE_MODE=response_stream

# Create start script
RUN echo '#!/bin/sh\n\
export PATH="$HOME/.local/bin:$PATH"\n\
if [ -f "Procfile" ]; then\n\
    CMD=$(grep "^web:" Procfile | sed "s/^web: *//")\n\
    if [ -n "$CMD" ]; then\n\
        echo "Starting: $CMD"\n\
        exec sh -c "$CMD"\n\
    fi\n\
fi\n\
if [ -f "main.py" ]; then\n\
    if grep -qE "FastAPI|fastapi" main.py 2>/dev/null; then\n\
        exec uvicorn main:app --host 0.0.0.0 --port ${PORT}\n\
    elif grep -qE "Flask|flask" main.py 2>/dev/null; then\n\
        exec gunicorn main:app -b 0.0.0.0:${PORT}\n\
    else\n\
        exec python main.py\n\
    fi\n\
elif [ -f "app.py" ]; then\n\
    if grep -qE "FastAPI|fastapi" app.py 2>/dev/null; then\n\
        exec uvicorn app:app --host 0.0.0.0 --port ${PORT}\n\
    elif grep -qE "Flask|flask" app.py 2>/dev/null; then\n\
        exec gunicorn app:app -b 0.0.0.0:${PORT}\n\
    else\n\
        exec python app.py\n\
    fi\n\
elif [ -f "server.py" ]; then\n\
    exec python server.py\n\
elif [ -f "run.py" ]; then\n\
    exec python run.py\n\
elif [ -f "manage.py" ]; then\n\
    WSGI=$(find . -name "wsgi.py" -path "*/*/wsgi.py" | head -1 | sed "s|^./||;s|/wsgi.py$||;s|/|.|g")\n\
    exec gunicorn $WSGI.wsgi:application -b 0.0.0.0:${PORT}\n\
elif [ -f "src/main.py" ]; then\n\
    if grep -qE "FastAPI|fastapi" src/main.py 2>/dev/null; then\n\
        exec uvicorn src.main:app --host 0.0.0.0 --port ${PORT}\n\
    else\n\
        exec python -m src.main\n\
    fi\n\
else\n\
    echo "ERROR: No entry point found"\n\
    exit 1\n\
fi\n\
' > /start.sh && chmod +x /start.sh

CMD ["/start.sh"]