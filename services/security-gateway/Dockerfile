FROM golang:1.23-alpine AS build

WORKDIR /app
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /security-gateway .

FROM alpine:3.20

RUN adduser -D -H appuser
USER appuser

COPY --from=build /security-gateway /usr/local/bin/security-gateway
EXPOSE 8020

CMD ["security-gateway"]
