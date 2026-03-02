# 🏢 AI Office Platform

Визуальная платформа для управления AI агентами с 2D офисной визуализацией.

## 🎯 Концепция

- **File-first архитектура** - все данные в markdown файлах
- **Визуальный интерфейс** - 2D офис с агентами-персонажами
- **WebSocket связь** - реальное время между frontend и backend
- **Легковесность** - оптимизация токенов и ресурсов
- **Расширяемость** - Telegram/WhatsApp интеграция (в планах)

## 🏗️ Структура

```
aipanel/
├── .env.example        # Шаблон конфигурации
├── .gitignore          # Git защита
│
├── backend/            # Node.js + Express + Socket.io
│   ├── agents/         # Агенты (markdown файлы)
│   ├── src/            # Исходный код
│   └── package.json
│
└── frontend/           # Next.js 14 + TypeScript
    ├── app/            # Pages
    ├── components/     # UI компоненты
    └── package.json
```

## 🚀 Быстрый Старт

**Для новых пользователей:** См. [SETUP.md](SETUP.md)

### 1. Onboarding

```bash
cd backend
npm install
npm run onboard
```

Выбери LLM провайдер и создай первого агента.

### 2. Установи Frontend

```bash
cd frontend
npm install
```

### 3. Запуск

**Терминал 1:**
```bash
cd backend
npm run dev
```

**Терминал 2:**
```bash
cd frontend
npm run dev
```

**Браузер:** http://localhost:3000

---

## 📁 Структура

```
aipanel/
├── .env.example        # Шаблон (коммитится)
├── .env                # Твои ключи (НЕ коммитится!)
│
├── backend/
│   ├── agents.example/ # Шаблоны (коммитится)
│   ├── agents/         # Твои агенты (НЕ коммитится!)
│   └── src/            # Код
│
└── frontend/
    └── ...
```

**Важно:** `backend/agents/` не попадает в git!

---

## 🌐 OpenRouter (Бесплатно!)

1. Получи ключ: https://openrouter.ai/keys
2. Бесплатные модели:
   - `meta-llama/llama-3-8b-instruct:free`
   - `google/gemini-flash-1.5:free`
   - `mistralai/mistral-7b-instruct:free`

---

## 🦙 Ollama (Локально)

```bash
# Установи
brew install ollama  # macOS

# Запусти
ollama serve

# Скачай модель
ollama pull llama2
```

---

## 🎮 Возможности

### MVP (Текущая Версия)
- ✅ 2D визуализация офиса
- ✅ Агенты с анимациями
- ✅ WebSocket связь
- ✅ File-first архитектура
- ✅ OpenRouter/OpenAI/Ollama
- ✅ Интерактивный onboarding

### В Разработке
- 🔄 Telegram интеграция
- 🔄 WhatsApp интеграция
- 🔄 UI для создания агентов
- 🔄 Система скиллов
- 🔄 MCP интеграция

---

## 🛠️ Tech Stack

**Backend:**
- Node.js + TypeScript
- Express.js + Socket.io
- OpenAI SDK
- Winston (логи)

**Frontend:**
- Next.js 14
- TypeScript
- Tailwind CSS
- shadcn/ui
- Zustand
- Framer Motion

---

## 🧪 Тестирование

```bash
# Backend health
curl http://localhost:4001/health

# Список агентов
curl http://localhost:4001/api/agents
```

### Что Проверить:
1. Индикатор "Connected" зеленый
2. TestBot виден в офисе
3. Кнопка "Send Request" работает
4. Статус меняется: idle → thinking → working → idle

---

## � Создание Агента

```bash
# Скопируй тестового агента
cp -r backend/agents/test-agent backend/agents/my-agent

# Отредактируй конфиг
nano backend/agents/my-agent/AGENT.md
```

Измени:
- `id: my-agent`
- `name: MyAgent`
- Personality
- LLM настройки

Перезапусти backend - агент появится автоматически!

---

## 🔒 Git Безопасность

### НЕ коммитится:
- ❌ `.env` (API ключи)
- ❌ `node_modules/`
- ❌ `logs/`
- ❌ `.DS_Store`

### Коммитится:
- ✅ `.env.example`
- ✅ Исходный код
- ✅ `AGENT.md`, `MEMORY.md`

### Проверка:
```bash
git status | grep "\.env$"
# Должно быть ПУСТО!
```

---

## 🐛 Troubleshooting

### Backend не запускается
```bash
# Проверь порт
lsof -i :4001
kill -9 $(lsof -t -i:4001)

# Проверь .env
cat .env | grep API_KEY
```

### Агент не отвечает
```bash
# Проверь логи
cat backend/logs/combined.log
cat backend/logs/error.log
```

---

## � License

MIT License

---

**Сделано с ❤️ для автоматизации рутинных задач**
