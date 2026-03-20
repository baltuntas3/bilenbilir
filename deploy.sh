#!/bin/bash
set -e

# ============================================
# BilenBilir - Cloud Run Manuel Deploy
# ============================================

PROJECT_ID="${GCP_PROJECT_ID:-}"
REGION="europe-west1"
BACKEND_SERVICE="bilenbilir-api"
FRONTEND_SERVICE="bilenbilir-web"

if [ -z "$PROJECT_ID" ]; then
  echo "Kullanım: GCP_PROJECT_ID=proje-id MONGODB_URI='...' JWT_SECRET='...' ./deploy.sh"
  exit 1
fi

if [ -z "$MONGODB_URI" ] || [ -z "$JWT_SECRET" ]; then
  echo "Hata: MONGODB_URI ve JWT_SECRET gerekli"
  exit 1
fi

echo ">>> Backend deploy ediliyor..."
gcloud run deploy $BACKEND_SERVICE \
  --source ./backend \
  --project $PROJECT_ID \
  --region $REGION \
  --allow-unauthenticated \
  --session-affinity \
  --timeout=3600 \
  --min-instances=0 \
  --max-instances=2 \
  --memory=256Mi \
  --cpu=1 \
  --set-env-vars="NODE_ENV=production,MONGODB_URI=${MONGODB_URI},JWT_SECRET=${JWT_SECRET},JWT_EXPIRES_IN=7d"

BACKEND_URL=$(gcloud run services describe $BACKEND_SERVICE --project $PROJECT_ID --region $REGION --format='value(status.url)')

echo ">>> Frontend build & deploy ediliyor..."
IMAGE="europe-west1-docker.pkg.dev/${PROJECT_ID}/cloud-run-source-deploy/${FRONTEND_SERVICE}:latest"

cd frontend
cat > cloudbuild.yaml << EOF
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '--build-arg'
      - 'VITE_API_URL=${BACKEND_URL}/api'
      - '-t'
      - '${IMAGE}'
      - '.'
images:
  - '${IMAGE}'
EOF

gcloud builds submit . \
  --config=cloudbuild.yaml \
  --project $PROJECT_ID

cd ..

gcloud run deploy $FRONTEND_SERVICE \
  --image $IMAGE \
  --project $PROJECT_ID \
  --region $REGION \
  --allow-unauthenticated \
  --min-instances=0 \
  --max-instances=2 \
  --memory=128Mi \
  --cpu=1 \
  --port=8080

FRONTEND_URL=$(gcloud run services describe $FRONTEND_SERVICE --project $PROJECT_ID --region $REGION --format='value(status.url)')

echo ">>> CORS güncelleniyor..."
gcloud run services update $BACKEND_SERVICE \
  --project $PROJECT_ID \
  --region $REGION \
  --update-env-vars="CLIENT_URL=${FRONTEND_URL}"

echo ""
echo "=== Deploy Tamamlandı ==="
echo "Backend:  $BACKEND_URL"
echo "Frontend: $FRONTEND_URL"
