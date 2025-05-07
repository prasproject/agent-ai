# Dokumentasi API Integrasi n8n dengan ChatHub

Dokumen ini berisi informasi tentang API endpoints untuk mengintegrasikan n8n dengan aplikasi ChatHub.

## Ringkasan API

Aplikasi ini menyediakan dua API utama untuk integrasi dengan n8n:

1. **Chatbot API**: Mengirim pesan ke chatbot dan mendapatkan respons
2. **Mode Switch API**: Mengalihkan percakapan antara mode bot dan mode admin

## Endpoint API

### 1. Chatbot API

```
POST /api/chatbot
```

Endpoint ini memungkinkan n8n untuk memanggil API chatbot eksternal dan mendapatkan responsnya.

#### Parameter Request

| Parameter | Tipe    | Deskripsi                                      | Wajib |
|-----------|---------|------------------------------------------------|-------|
| name      | string  | Nama pengguna untuk konteks chatbot            | Ya    |
| message   | string  | Pesan yang akan dikirim ke chatbot             | Ya    |
| id_cabang | string  | ID cabang untuk chatbot, default: "main"       | Tidak |
| sessionId | number  | ID sesi untuk mengaitkan pesan dengan sesi     | Tidak |

#### Contoh Request

```json
{
  "name": "User #123",
  "message": "Halo, saya butuh bantuan",
  "id_cabang": "main",
  "sessionId": 1
}
```

#### Respons

| Field         | Tipe    | Deskripsi                                               |
|---------------|---------|--------------------------------------------------------|
| success       | boolean | Status keberhasilan operasi                             |
| response      | object  | Respons mentah dari API chatbot eksternal               |
| message       | string  | Pesan respons dari chatbot                              |
| needsHumanHelp| boolean | Apakah chatbot perlu bantuan manusia (eskalasi ke admin)|

#### Contoh Respons

```json
{
  "success": true,
  "response": {
    "output": "Baik, saya siap membantu. Apa yang bisa saya bantu?"
  },
  "message": "Baik, saya siap membantu. Apa yang bisa saya bantu?",
  "needsHumanHelp": false
}
```

#### Deteksi Eskalasi Otomatis

API ini secara otomatis mendeteksi kapan perlu eskalasi ke admin manusia dengan:

1. Memeriksa flag `needsHumanHelp` dalam respons API eksternal
2. Menggunakan pola regex untuk mengidentifikasi frasa dalam respons yang menunjukkan bot tidak dapat menjawab
3. Memeriksa jika tidak ada respons pesan yang diterima

Jika seseorang memiliki `sessionId`, sesi chat akan otomatis diubah ke mode admin dan notifikasi dibuat.

Pola Regex yang digunakan:
```
/(saya belum bisa kasih jawaban|tidak bisa menjawab|akan saya arahkan ke Agent Manusia|tidak dapat menjawab pertanyaan)/i
```

### 2. Mode Switch API

```
POST /api/mode-switch-webhook
```

Endpoint ini dirancang untuk n8n untuk mengalihkan mode chat antara bot dan admin.

#### Parameter Request

| Parameter | Tipe    | Deskripsi                                       | Wajib |
|-----------|---------|--------------------------------------------------|-------|
| sessionId | number  | ID sesi chat yang akan diubah modenya            | Ya    |
| switch    | boolean | True untuk beralih ke mode admin, False untuk bot | Ya    |

**Penting**: Nilai parameter `switch` bekerja dengan logika terbalik. Ketika `switch: true` berarti mengalihkan ke mode admin (nonaktifkan bot), dan `switch: false` berarti mengalihkan ke mode bot (aktifkan bot).

#### Contoh Request

```json
{
  "sessionId": 1,
  "switch": true
}
```

#### Respons

| Field      | Tipe    | Deskripsi                                         |
|------------|---------|---------------------------------------------------|
| success    | boolean | Status keberhasilan operasi                       |
| isBotMode  | boolean | Mode saat ini setelah pengalihan                  |
| message    | string  | Pesan yang dapat dibaca manusia tentang perubahan |
| session    | object  | Informasi dasar tentang sesi                      |

#### Contoh Respons

```json
{
  "success": true,
  "isBotMode": false,
  "message": "Changed to admin mode",
  "session": {
    "id": 1,
    "userId": "user-123",
    "userName": "User #123",
    "status": "active"
  }
}
```

## Penggunaan dalam n8n

### Contoh Node HTTP Request untuk Chatbot API

1. Tambahkan node HTTP Request
2. Atur metode ke POST
3. Atur URL ke `https://[replit-domain]/api/chatbot`
4. Atur body ke JSON:
   ```json
   {
     "name": "{{$node["PreviousNode"].json["name"]}}",
     "message": "{{$node["PreviousNode"].json["message"]}}",
     "sessionId": {{$node["PreviousNode"].json["sessionId"]}}
   }
   ```

### Contoh Node HTTP Request untuk Mode Switch API

1. Tambahkan node HTTP Request 
2. Atur metode ke POST
3. Atur URL ke `https://[replit-domain]/api/mode-switch-webhook`
4. Atur body ke JSON:
   ```json
   {
     "sessionId": {{$node["PreviousNode"].json["sessionId"]}},
     "switch": true
   }
   ```

## Catatan Penting

1. **Aktivasi Webhook n8n**:  
   Saat menggunakan webhook di n8n, pastikan untuk mengklik tombol "Test workflow" di kanvas sebelum mencoba memanggil webhook. Di mode pengujian, webhook hanya berfungsi untuk satu panggilan setelah Anda mengklik tombol ini.

2. **Logika Switch Mode**:  
   Perhatikan bahwa parameter `switch` memiliki logika terbalik:
   - `switch: true` = Beralih ke mode admin (menonaktifkan bot)
   - `switch: false` = Beralih ke mode bot (mengaktifkan bot)

3. **Alur Logis di n8n**:  
   Anda mungkin ingin membuat alur logis seperti:
   - Terima pesan via webhook n8n
   - Panggil API chatbot untuk mendapatkan respons
   - Periksa jika `needsHumanHelp: true`
   - Jika iya, panggil API mode switch dengan `switch: true`