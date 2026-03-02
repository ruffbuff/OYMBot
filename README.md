# 🏢 AI Office Platform v0.1.0

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

### 1. Onboarding

```bash
cd backend
npm install
npm run onboard
```

Выбери LLM провайдер:
- **OpenRouter** (рекомендуется - бесплатно!)
- OpenAI
- Ollama (локально)
- Anthropic

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

## 🌐 OpenRout
**Браузер:** http://localhost:3000

---

## 🌐 OpenRouter (Рекомендуется)

Бесплатный тариф без кредитной карты:
- Получи ключ: https://openrouter.ai/keys
- Бесплатные модели: `meta-llama/llama-3-8b-instruct:free`

### 3. Установи Зависимости

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 4. Запусти

**Терминал 1 (Backend):**
```bash
cd backend
npm run dev
```

**Терминал 2 (Frontend):**
```bash
cd frontend
npm run dev
```

**Браузер:** http://localhost:3000

## 📋 Требования

- Node.js 18+
- npm или yarn
- OpenAI API ключ ИЛИ Ollama (локально)

### Для Ollama (опционально):

```bash
# Установи Ollama
brew install ollama  # macOS
# или скачай с https://ollama.ai

# Запусти
ollama serve

# Скачай модель
ollama pull llama2
```

## 🎮 Возможности

### Текущая Версия (MVP)
- ✅ 2D визуализация офиса
- ✅ Агенты с анимациями (idle, thinking, working, error, offline)
- ✅ WebSocket связь frontend-backend
- ✅ File-first архитектура (markdown файлы)
- ✅ Поддержка OpenAI и Ollama
- ✅ Система энергии агентов
- ✅ Тестовые кнопки (Send Request, Load Spike, Error, Panic)

### В Разработке
- 🔄 Telegram интеграция
- 🔄 WhatsApp интеграция
- 🔄 UI для создания агентов
- 🔄 Система скиллов
- 🔄 MCP интеграция
- 🔄 Оптимизация токенов
- 🔄 Docker изоляция

## 🛠️ Tech Stack

### Backend
- Node.js + TypeScript
- Express.js
- Socket.io (WebSocket)
- OpenAI SDK
- Winston (логирование)
- Gray-matter (markdown parsing)

### Frontend
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- shadcn/ui
- Zustand (state)
- Framer Motion (анимации)
- Socket.io-client

## 📖 Документация

- **[БЫСТРЫЙ_СТАРТ.md](БЫСТРЫЙ_СТАРТ.md)** - Подробная инструкция на русском
- **[ГОТОВО_К_ТЕСТУ.md](ГОТОВО_К_ТЕСТУ.md)** - Краткая сводка перед тестом
- **[FIRST_TEST.md](FIRST_TEST.md)** - Testing guide (English)
- **[CHECKLIST.md](CHECKLIST.md)** - Pre-launch checklist
- **[backend/QUICKSTART.md](backend/QUICKSTART.md)** - Backend setup
- **[.kiro/specs/](. kiro/specs/)** - Полная спецификация проекта

## 🔒 Безопасность

### Что НЕ коммитится в Git:
- ✅ `.env` файлы (содержат API ключи)
- ✅ `node_modules/`
- ✅ `logs/` (логи backend)
- ✅ `dist/`, `build/` (скомпилированный код)
- ✅ `.next/` (Next.js build)

### Что коммитится:
- ✅ `.env.example` (шаблон без ключей)
- ✅ Исходный код
- ✅ Конфигурация агентов (`AGENT.md`)
- ✅ Базовая память агентов (`MEMORY.md`)
- ⚠️ `CONTEXT.md` - опционально (можно исключить)

## 🧪 Тестирование

```bash
# Проверь что backend запустился
curl http://localhost:4001/health

# Проверь список агентов
curl http://localhost:4001/api/agents

# Открой frontend
open http://localhost:3000
```

### Что Проверить:
1. Индикатор "Connected" зеленый
2. TestBot виден в офисе
3. Кнопка "Send Request" работает
4. Статус меняется: idle → thinking → working → idle
5. Контекст сохраняется в `backend/agents/test-agent/CONTEXT.md`

## 🐛 Troubleshooting

### Backend не запускается
```bash
# Проверь порт
lsof -i :4001

# Убей процесс если занят
kill -9 $(lsof -t -i:4001)

# Проверь логи
cat backend/logs/error.log
```

### Frontend не подключается
- Убедись что backend запущен на порту 4001
- Проверь консоль браузера (F12)
- Индикатор должен быть зеленый

### Агент не отвечает
- Проверь API ключ в `backend/.env`
- Проверь баланс OpenAI
- Проверь логи: `backend/logs/combined.log`

## 📝 Создание Нового Агента

```bash
# Скопируй тестового агента
cp -r backend/agents/test-agent backend/agents/my-agent

# Отредактируй конфиг
nano backend/agents/my-agent/AGENT.md
```

Измени:
- `id: my-agent`
- `name: MyAgent`
- Personality и capabilities
- LLM настройки

Перезапусти backend - агент появится автоматически!

## 🤝 Contributing

1. Fork проект
2. Создай feature branch (`git checkout -b feature/amazing-feature`)
3. Commit изменения (`git commit -m 'Add amazing feature'`)
4. Push в branch (`git push origin feature/amazing-feature`)
5. Открой Pull Request

## 📄 License

MIT License - см. [LICENSE](LICENSE)

## 🙏 Acknowledgments

- Вдохновлено [OpenClaw](https://docs.openclaw.ai/)
- UI компоненты от [shadcn/ui](https://ui.shadcn.com/)
- Анимации от [Framer Motion](https://www.framer.com/motion/)

## 📞 Support

Если нашел баг или есть предложения:
- Открой Issue
- Напиши в Discussions
- Создай Pull Request

---

**Сделано с ❤️ для автоматизации рутинных задач**
