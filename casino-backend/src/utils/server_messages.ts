import { Request } from 'express';

export interface LanguageRequest extends Request {
  language: keyof typeof server_messages;
}

export const server_messages = {
  // English
  en: {
    invalidId: 'Invalid user ID format',
    playersList: 'Players retrieved successfully',
    playerNotFound: 'Player not found',
    playerDetails: 'Player details retrieved successfully',
    playersDetailsFailed: 'Failed to retrieve player details',
    playersFailed: 'Failed to retrieve players',
  },
  // Bengali
  bn: {
    invalidId: 'অবৈধ ব্যবহারকারী আইডি ফরম্যাট',
    playersList: 'প্লেয়াররা সফলভাবে পুনরুদ্ধার করা হয়েছে',
    playerNotFound: 'প্লেয়ার খুঁজে পাওয়া যায়নি',
    playerDetails: 'প্লেয়ারের বিবরণ সফলভাবে পুনরুদ্ধার করা হয়েছে',
    playersDetailsFailed: 'প্লেয়ারের বিবরণ পুনরুদ্ধারে ব্যর্থ হয়েছে',
    playersFailed: 'প্লেয়ারদের পুনরুদ্ধারে ব্যর্থ হয়েছে',
  },
  // Portuguese
  pt: {
    invalidId: 'Formato de ID de usuário inválido',
    playersList: 'Jogadores recuperados com sucesso',
    playerNotFound: 'Jogador não encontrado',
    playerDetails: 'Detalhes do jogador recuperados com sucesso',
    playersDetailsFailed: 'Falha ao recuperar detalhes do jogador',
    playersFailed: 'Falha ao recuperar jogadores',
  },
  // Indonesian
  id: {
    invalidId: 'Format ID pengguna tidak valid',
    playersList: 'Pemain berhasil diambil',
    playerNotFound: 'Pemain tidak ditemukan',
    playerDetails: 'Detail pemain berhasil diambil',
    playersDetailsFailed: 'Gagal mengambil detail pemain',
    playersFailed: 'Gagal mengambil pemain',
  },
  // Filipino
  fil: {
    invalidId: 'Di-wastong format ng user ID',
    playersList: 'Matagumpay na nakuha ang mga manlalaro',
    playerNotFound: 'Hindi natagpuan ang manlalaro',
    playerDetails: 'Matagumpay na nakuha ang mga detalye ng manlalaro',
    playersDetailsFailed: 'Nabigong kunin ang mga detalye ng manlalaro',
    playersFailed: 'Nabigong kunin ang mga manlalaro',
  },
  // Vietnamese
  vi: {
    invalidId: 'Định dạng ID người dùng không hợp lệ',
    playersList: 'Người chơi đã được truy xuất thành công',
    playerNotFound: 'Không tìm thấy người chơi',
    playerDetails: 'Chi tiết người chơi đã được truy xuất thành công',
    playersDetailsFailed: 'Không thể truy xuất chi tiết người chơi',
    playersFailed: 'Không thể truy xuất người chơi',
  },
} as const;

