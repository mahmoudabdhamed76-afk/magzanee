FROM node:22-alpine

WORKDIR /app

# مفيش أي dependencies — بننسخ المشروع كله وخلاص
COPY . .

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
