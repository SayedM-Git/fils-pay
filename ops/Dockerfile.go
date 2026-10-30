FROM golang:1.22-alpine AS build
WORKDIR /src
COPY apps/settlement/go.mod apps/settlement/go.sum ./
RUN go mod download
COPY apps/settlement/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/settlement ./cmd/settlement

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=build /out/settlement ./settlement
USER 10001:10001
ENTRYPOINT ["./settlement"]
