# 🏢 Open Your Mind Bot v0.1.4

AI Agent Platform с визуализированным офисом и мультиканальной поддержкой.

## 🚀 Быстрый старт

```bash
cd backend
npm install
npm start
```

Готово! Можно чатиться с агентом.

## ✨ Особенности

- 🎮 **Визуализированный офис** - мини-игра интерфейс для управления агентами
- 💬 **Мультиканальность** - CLI, Telegram, Web (будущее: Discord, WhatsApp)
- 🔄 **Изолированные сессии** - каждый канал имеет свою историю
- 🎯 **Простота** - `npm start` и всё работает
- 💾 **Персистентность** - сессии и история сохраняются
- 🤖 **Правильные ответы** - агент знает свою модель (не путает с OpenClaw)

## 📚 Документация

- [QUICKSTART.md](QUICKSTART.md) - быстрый старт (2 шага)
- [ARCHITECTURE_COMPARISON.md](ARCHITECTURE_COMPARISON.md) - сравнение с OpenClaw
- [TESTING_CHECKLIST.md](TESTING_CHECKLIST.md) - чеклист для тестирования
- [CURRENT_STATUS.md](CURRENT_STATUS.md) - текущий статус проекта
- [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) - полная документация

## 🏗️ Архитектура

```
Gateway (порты 4000/4001)
├── CLI/TUI (chalk)
├── Telegram Bot
├── Web UI (Next.js + офис-визуализация)
└── Будущее: Discord, WhatsApp

Сессии:
- cli:local:agentId
- telegram:userId:agentId
- Web выбирает из существующих
```

## 🎯 Основные компоненты

- **Gateway** - централизованный WebSocket hub
- **AgentRuntime** - выполнение задач и управление агентами
- **SessionManager** - изоляция сессий по каналам
- **MemoryManager** - контекст и транскрипты
- **CommandManager** - универсальные команды

## 💬 Команды

- `/help` - список команд
- `/status` - статус агента
- `/model` - показать/изменить модель
- `/agents` - список агентов
- `/sessions` - активные сессии
- `/clear` - очистить контекст

## 🔧 Технологии

- **Backend**: Node.js 22+, TypeScript, Socket.io
- **Frontend**: Next.js, React, Tailwind CSS
- **CLI**: chalk, inquirer
- **Конфиги**: Markdown (AGENT.md, SOUL.md)
- **Хранение**: JSONL (транскрипты) + Markdown (контекст)

## 📦 Структура проекта

```
backend/
├── src/
│   ├── agents/         # AgentRuntime
│   ├── cli/            # CLI интерфейс
│   ├── gateway/        # WebSocket сервер
│   ├── services/       # Сервисы (LLM, Memory, Session, Tools, Commands)
│   └── types/          # TypeScript типы
├── agents/             # Агенты (AGENT.md, SOUL.md, sessions/)
└── start.sh            # Скрипт запуска

frontend/
├── app/                # Next.js страницы
├── components/         # React компоненты
│   ├── agents/         # Компоненты агентов
│   ├── office/         # Офис-визуализация
│   └── ui/             # UI компоненты
└── store/              # Zustand store
```

## 🧪 Тестирование

См. [TESTING_CHECKLIST.md](TESTING_CHECKLIST.md) для полного чеклиста.

Базовый тест:
```bash
# 1. CLI
cd backend
npm start
# Напишите: "what model are you using?"
# Агент должен ответить правильно (не "OpenClaw")

# 2. Web (в другом терминале)
cd frontend
npm run dev
# Откройте http://localhost:3000
```

## 🤝 Вклад

Проект в активной разработке. Основано на идеях OpenClaw, но с уникальными фичами.

## 📄 Лицензия

MIT

## 🙏 Благодарности

- OpenClaw за вдохновение и архитектурные идеи
- Сообщество за поддержку

---

**Статус**: ✅ Готово к тестированию

**Версия**: 0.1.4

**Дата**: 2026-03-02
