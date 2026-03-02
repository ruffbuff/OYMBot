# 🚀 Setup Guide - Fresh Install

## Для Новых Пользователей

Эта инструкция для тех, кто клонирует репозиторий впервые.

---

## 📦 Что в Репозитории

```
aipanel/
├── .env.example         # Шаблон конфигурации
├── backend/
│   ├── agents.example/  # Примеры агентов (шаблоны)
│   └── agents/          # Твои агенты (создаются при onboard)
└── frontend/
```

**Важно:**
- `backend/agents/` - НЕ в git (твои локальные агенты)
- `backend/agents.example/` - В git (шаблоны для копирования)
- `.env` - НЕ в git (твои ключи)

---

## 🎯 Первый Запуск

### 1. Клонируй Репозиторий

```bash
git clone https://github.com/your-username/aipanel.git
cd aipanel
```

### 2. Установи Зависимости

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 3. Onboarding (Настройка)

```bash
cd backend
npm run onboard
```

Это создаст:
- ✅ `.env` файл в корне
- ✅ Твоего первого агента в `backend/agents/`
- ✅ Настройки LLM провайдера

**Выбери провайдер:**
1. OpenRouter (рекомендуется - бесплатно!)
2. OpenAI
3. Ollama (локально)
4. Anthropic

### 4. Запуск

**Терминал 1 - Backend:**
```bash
cd backend
npm run dev
```

**Терминал 2 - Frontend:**
```bash
cd frontend
npm run dev
```

**Браузер:** http://localhost:3000

---

## 🧪 Тестирование

### Telegram Bot
```
1. Открой Telegram
2. Найди своего бота
3. /start
4. Напиши сообщение
```

### Frontend
```
1. http://localhost:3000
2. Кликни на агента
3. "Open Chat"
4. Напиши сообщение
```

---

## 📁 Структура После Setup

```
aipanel/
├── .env                 # Твои ключи (НЕ коммитится!)
├── .gitignore
├── backend/
│   ├── agents/          # Твои агенты (НЕ коммитится!)
│   │   └── my-agent/
│   │       ├── AGENT.md
│   │       ├── MEMORY.md
│   │       └── CONTEXT.md
│   ├── agents.example/  # Шаблоны (коммитится)
│   └── logs/            # Логи (НЕ коммитится!)
└── frontend/
```

---

## 🔄 Обновление из Git

Когда делаешь `git pull`:

```bash
git pull origin main

# Твои данные сохранятся:
# ✅ .env
# ✅ backend/agents/
# ✅ backend/logs/

# Обновятся только:
# - Код
# - Зависимости (npm install)
# - Шаблоны (agents.example)
```

---

## 🆕 Добавление Нового Агента

### Вариант 1: Через Onboarding
```bash
cd backend
npm run onboard
# Выбери провайдер
# Введи имя нового агента
```

### Вариант 2: Копирование
```bash
# Скопируй example
cp -r backend/agents.example/example-agent backend/agents/my-new-agent

# Отредактируй
nano backend/agents/my-new-agent/AGENT.md
# Измени id, name, personality

# Перезапусти backend
```

---

## 🗑️ Удаление Агента

```bash
rm -rf backend/agents/agent-name
# Перезапусти backend
```

---

## 🔒 Git Безопасность

### Что НЕ попадет в Git:
- ❌ `.env` (твои ключи)
- ❌ `backend/agents/` (твои агенты)
- ❌ `backend/logs/` (логи)
- ❌ `node_modules/`

### Что попадет в Git:
- ✅ Код
- ✅ `backend/agents.example/` (шаблоны)
- ✅ `.env.example` (шаблон без ключей)
- ✅ Документация

### Проверка перед commit:
```bash
git status

# Не должно быть:
# - .env
# - backend/agents/ (кроме agents.example)
# - backend/logs/
```

---

## 💡 Советы

1. **Бэкап агентов:**
   ```bash
   cp -r backend/agents backend/agents.backup
   ```

2. **Разные провайдеры:**
   - Можно создать агентов с разными провайдерами
   - Один на OpenRouter, другой на Ollama

3. **Тестирование:**
   - Используй `agents.example` как базу
   - Твои изменения в `agents/` не влияют на git

---

## 🆘 Проблемы?

### "No agents found"
```bash
cd backend
npm run onboard
# Создай первого агента
```

### "Connection refused"
```bash
# Проверь что backend запущен
lsof -i :4001
```

### "API key not configured"
```bash
# Проверь .env
cat .env | grep API_KEY
```

---

## ✅ Готово!

Теперь у тебя:
- Чистый репозиторий для git
- Локальные данные отдельно
- Можно тестировать без страха сломать git

Удачи! 🚀
