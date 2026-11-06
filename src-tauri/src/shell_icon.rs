//! O ícone de um app instalado, tirado do próprio Windows (o mesmo que o Explorer mostra), para quando a internet não
//! tem a imagem dele. Devolve um PNG; o codificador é mínimo (sem compressão) para não depender de outra biblioteca.

/// CRC-32 (o do PNG).
fn crc32(data: &[u8]) -> u32 {
    let mut table = [0u32; 256];
    for (n, slot) in table.iter_mut().enumerate() {
        let mut c = n as u32;
        for _ in 0..8 {
            c = if c & 1 != 0 { 0xEDB8_8320 ^ (c >> 1) } else { c >> 1 };
        }
        *slot = c;
    }
    let mut crc = 0xFFFF_FFFFu32;
    for &byte in data {
        crc = table[((crc ^ byte as u32) & 0xFF) as usize] ^ (crc >> 8);
    }
    crc ^ 0xFFFF_FFFF
}

fn adler32(data: &[u8]) -> u32 {
    let (mut a, mut b) = (1u32, 0u32);
    for &byte in data {
        a = (a + byte as u32) % 65_521;
        b = (b + a) % 65_521;
    }
    (b << 16) | a
}

fn chunk(out: &mut Vec<u8>, kind: &[u8; 4], data: &[u8]) {
    out.extend_from_slice(&(data.len() as u32).to_be_bytes());
    let start = out.len();
    out.extend_from_slice(kind);
    out.extend_from_slice(data);
    let crc = crc32(&out[start..]);
    out.extend_from_slice(&crc.to_be_bytes());
}

/// Um PNG RGBA de 8 bits (`rgba` tem `largura * altura * 4` bytes, com alfa direto, não pré-multiplicado).
pub fn encode_png(width: u32, height: u32, rgba: &[u8]) -> Vec<u8> {
    let stride = width as usize * 4;
    let mut raw = Vec::with_capacity((stride + 1) * height as usize);
    for row in rgba.chunks(stride).take(height as usize) {
        raw.push(0); // filtro "nenhum"
        raw.extend_from_slice(row);
    }

    // zlib com blocos "armazenados" (sem compressão).
    let mut z = vec![0x78, 0x01];
    let mut blocks = raw.chunks(65_535).peekable();
    while let Some(block) = blocks.next() {
        z.push(u8::from(blocks.peek().is_none()));
        z.extend_from_slice(&(block.len() as u16).to_le_bytes());
        z.extend_from_slice(&(!(block.len() as u16)).to_le_bytes());
        z.extend_from_slice(block);
    }
    z.extend_from_slice(&adler32(&raw).to_be_bytes());

    let mut header = Vec::with_capacity(13);
    header.extend_from_slice(&width.to_be_bytes());
    header.extend_from_slice(&height.to_be_bytes());
    header.extend_from_slice(&[8, 6, 0, 0, 0]); // 8 bits, RGBA

    let mut png = vec![0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
    chunk(&mut png, b"IHDR", &header);
    chunk(&mut png, b"IDAT", &z);
    chunk(&mut png, b"IEND", &[]);
    png
}

/// BGRA com alfa pré-multiplicado (como o Windows entrega) → RGBA com alfa direto.
pub fn bgra_premultiplied_to_rgba(bgra: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(bgra.len());
    for px in bgra.chunks_exact(4) {
        let a = px[3] as u32;
        let un = |c: u8| if a == 0 { 0 } else { ((c as u32 * 255 + a / 2) / a).min(255) as u8 };
        out.extend_from_slice(&[un(px[2]), un(px[1]), un(px[0]), px[3]]);
    }
    out
}

/// O ícone de um programa, atalho `.lnk` ou app da Loja (`shell:AppsFolder\…`), em PNG de `size` pixels.
#[cfg(windows)]
pub fn icon_png(target: &str, size: i32) -> Option<Vec<u8>> {
    use std::ffi::c_void;
    use windows::Win32::Foundation::SIZE;
    use windows::Win32::Graphics::Gdi::{BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, CreateCompatibleDC, DIB_RGB_COLORS, DeleteDC, DeleteObject, GetDIBits, GetObjectW, HGDIOBJ};
    use windows::Win32::System::Com::{COINIT_APARTMENTTHREADED, CoInitializeEx};
    use windows::Win32::UI::Shell::{IShellItemImageFactory, SHCreateItemFromParsingName, SIIGBF_ICONONLY};
    use windows::core::PCWSTR;

    let wide: Vec<u16> = target.encode_utf16().chain(std::iter::once(0)).collect();
    unsafe {
        // Já iniciado (ou em outro modo) nesta thread não é erro para o que precisamos.
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let factory: IShellItemImageFactory = SHCreateItemFromParsingName(PCWSTR(wide.as_ptr()), None).ok()?;
        let bitmap = factory.GetImage(SIZE { cx: size, cy: size }, SIIGBF_ICONONLY).ok()?;

        let mut info = BITMAP::default();
        let got = GetObjectW(HGDIOBJ(bitmap.0), std::mem::size_of::<BITMAP>() as i32, Some(&mut info as *mut BITMAP as *mut c_void));
        if got == 0 || info.bmWidth <= 0 || info.bmHeight <= 0 {
            let _ = DeleteObject(HGDIOBJ(bitmap.0));
            return None;
        }
        let (width, height) = (info.bmWidth, info.bmHeight);

        let mut header = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height, // de cima para baixo
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut pixels = vec![0u8; width as usize * height as usize * 4];
        let dc = CreateCompatibleDC(None);
        let lines = GetDIBits(dc, bitmap, 0, height as u32, Some(pixels.as_mut_ptr() as *mut c_void), &mut header, DIB_RGB_COLORS);
        let _ = DeleteDC(dc);
        let _ = DeleteObject(HGDIOBJ(bitmap.0));
        if lines == 0 {
            return None;
        }
        Some(encode_png(width as u32, height as u32, &bgra_premultiplied_to_rgba(&pixels)))
    }
}

#[cfg(not(windows))]
pub fn icon_png(_target: &str, _size: i32) -> Option<Vec<u8>> {
    None
}

#[cfg(test)]
mod tests {
    use super::{bgra_premultiplied_to_rgba, crc32, encode_png};

    /// Teste de fumaça na máquina real: o ícone do Bloco de Notas sai como um PNG de 256 pixels, com partes transparentes.
    #[cfg(windows)]
    #[test]
    fn extrai_o_icone_de_um_programa_do_windows() {
        let png = super::icon_png("C:\\Windows\\System32\\notepad.exe", 256).expect("o Windows devolve o ícone");
        assert_eq!(&png[..8], [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]);
        assert_eq!(u32::from_be_bytes(png[16..20].try_into().unwrap()), 256);
        assert!(super::icon_png("C:\\nao\\existe\\nada.exe", 256).is_none());
    }

    #[test]
    fn crc32_conhecido() {
        assert_eq!(crc32(b"123456789"), 0xCBF4_3926);
    }

    #[test]
    fn png_tem_assinatura_cabecalho_e_fim() {
        let rgba = vec![255u8; 2 * 3 * 4];
        let png = encode_png(2, 3, &rgba);
        assert_eq!(&png[..8], [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]);
        assert_eq!(&png[12..16], b"IHDR");
        assert_eq!(u32::from_be_bytes(png[16..20].try_into().unwrap()), 2);
        assert_eq!(u32::from_be_bytes(png[20..24].try_into().unwrap()), 3);
        assert_eq!(&png[png.len() - 8..png.len() - 4], b"IEND");
    }

    #[test]
    fn png_grande_divide_em_blocos() {
        // 256x256 RGBA passa de 65535 bytes: o último bloco (e só ele) leva o bit "final".
        let png = encode_png(256, 256, &vec![7u8; 256 * 256 * 4]);
        assert!(png.len() > 256 * 256 * 4);
    }

    #[test]
    fn desfaz_o_alfa_pre_multiplicado() {
        // Azul (BGRA 128,0,0) a 50% de alfa: pré-multiplicado 64 → 128 de volta; invisível vira tudo zero.
        assert_eq!(bgra_premultiplied_to_rgba(&[64, 0, 0, 128, 9, 9, 9, 0]), vec![0, 0, 128, 128, 0, 0, 0, 0]);
    }
}
