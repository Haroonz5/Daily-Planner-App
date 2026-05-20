FROM golang:1.23-alpine AS build

WORKDIR /app
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /stats-aggregator .

FROM alpine:3.20

RUN adduser -D -H appuser
USER appuser

COPY --from=build /stats-aggregator /usr/local/bin/stats-aggregator
EXPOSE 8010

CMD ["stats-aggregator"]
