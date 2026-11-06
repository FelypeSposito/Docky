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

/// BGRA com alfa direto (como vem do bitmap de cor de um ícone) → RGBA. Se o bitmap não tem alfa nenhum (ícone antigo,
/// de 24 bits), a transparência vem da máscara: `mask_bgra` com pixel claro = transparente.
pub fn bgra_straight_to_rgba(bgra: &[u8], mask_bgra: Option<&[u8]>) -> Vec<u8> {
    let has_alpha = bgra.chunks_exact(4).any(|px| px[3] != 0);
    let mut out = Vec::with_capacity(bgra.len());
    for (i, px) in bgra.chunks_exact(4).enumerate() {
        let alpha = if has_alpha {
            px[3]
        } else if mask_bgra.and_then(|mask| mask.get(i * 4)).is_some_and(|&m| m > 127) {
            0
        } else {
            255
        };
        out.extend_from_slice(&[px[2], px[1], px[0], alpha]);
    }
    out
}

/// De onde sai o ícone de um destino: um `.exe`, `.dll` ou `.ico` (com o número do ícone) ou, num atalho `.lnk`, o
/// ícone que ele escolheu ou o do programa para o qual aponta. `None` para pastas, apps da Loja e o resto.
#[cfg(windows)]
fn icon_source(target: &str) -> Option<(String, i32)> {
    use windows::Win32::System::Com::{CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, CoCreateInstance, CoInitializeEx, IPersistFile, STGM_READ};
    use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};
    use windows::core::{Interface, PCWSTR};

    let lower = target.to_ascii_lowercase();
    let has_icons = |path: &str| [".exe", ".dll", ".ico"].iter().any(|ext| path.to_ascii_lowercase().ends_with(ext));
    if has_icons(&lower) {
        return Some((target.to_string(), 0));
    }
    if !lower.ends_with(".lnk") {
        return None;
    }
    let wide: Vec<u16> = target.encode_utf16().chain(std::iter::once(0)).collect();
    let text = |buffer: &[u16]| String::from_utf16_lossy(&buffer[..buffer.iter().position(|&c| c == 0).unwrap_or(buffer.len())]);
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).ok()?;
        let file: IPersistFile = link.cast().ok()?;
        file.Load(PCWSTR(wide.as_ptr()), STGM_READ).ok()?;
        let mut icon_path = [0u16; 260];
        let mut index = 0;
        link.GetIconLocation(&mut icon_path, &mut index).ok()?;
        let chosen = crate::launcher::expand_env(&text(&icon_path));
        if has_icons(&chosen) && std::path::Path::new(&chosen).is_file() {
            return Some((chosen, index));
        }
        let mut program = [0u16; 260];
        link.GetPath(&mut program, std::ptr::null_mut(), 0).ok()?;
        let program = text(&program);
        (has_icons(&program) && std::path::Path::new(&program).is_file()).then_some((program, 0))
    }
}

/// O maior ícone guardado dentro de um `.exe`/`.dll`/`.ico`, esticado para `size` se for menor (mais fiel ao app do que
/// a miniatura da casca, que põe um ícone pequeno no meio de um quadro branco).
#[cfg(windows)]
fn resource_png(file: &str, index: i32, size: i32) -> Option<Vec<u8>> {
    use std::ffi::c_void;
    use windows::Win32::Graphics::Gdi::{BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, CreateCompatibleDC, DIB_RGB_COLORS, DeleteDC, DeleteObject, GetDIBits, GetObjectW, HBITMAP, HDC, HGDIOBJ};
    use windows::Win32::UI::WindowsAndMessaging::{DestroyIcon, GetIconInfo, HICON, ICONINFO, PrivateExtractIconsW};

    let mut name = [0u16; 260];
    for (slot, unit) in name.iter_mut().zip(file.encode_utf16().take(259)) {
        *slot = unit;
    }
    unsafe {
        let mut icons = [HICON::default()];
        let mut ids = [0u32];
        let got = PrivateExtractIconsW(&name, index, size, size, Some(&mut icons), Some(ids.as_mut_ptr()), 0);
        if got == 0 || got == u32::MAX || icons[0].is_invalid() {
            return None;
        }
        let hicon = icons[0];
        let mut info = ICONINFO::default();
        if GetIconInfo(hicon, &mut info).is_err() {
            let _ = DestroyIcon(hicon);
            return None;
        }

        // Lê um bitmap (cor ou máscara) como BGRA de cima para baixo.
        let read = |dc: HDC, bitmap: HBITMAP| -> Option<(i32, i32, Vec<u8>)> {
            let mut shape = BITMAP::default();
            if GetObjectW(HGDIOBJ(bitmap.0), std::mem::size_of::<BITMAP>() as i32, Some(&mut shape as *mut BITMAP as *mut c_void)) == 0 {
                return None;
            }
            let (width, height) = (shape.bmWidth, shape.bmHeight);
            let mut header = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER { biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32, biWidth: width, biHeight: -height, biPlanes: 1, biBitCount: 32, biCompression: BI_RGB.0, ..Default::default() },
                ..Default::default()
            };
            let mut pixels = vec![0u8; width as usize * height as usize * 4];
            let lines = GetDIBits(dc, bitmap, 0, height as u32, Some(pixels.as_mut_ptr() as *mut c_void), &mut header, DIB_RGB_COLORS);
            (lines != 0).then_some((width, height, pixels))
        };

        let dc = CreateCompatibleDC(None);
        let color = read(dc, info.hbmColor);
        let mask = read(dc, info.hbmMask);
        let _ = DeleteDC(dc);
        let _ = DeleteObject(HGDIOBJ(info.hbmColor.0));
        let _ = DeleteObject(HGDIOBJ(info.hbmMask.0));
        let _ = DestroyIcon(hicon);

        let (width, height, bgra) = color?;
        let mask = mask.filter(|(w, h, _)| *w == width && *h == height).map(|(_, _, pixels)| pixels);
        Some(encode_png(width as u32, height as u32, &bgra_straight_to_rgba(&bgra, mask.as_deref())))
    }
}

/// O ícone de um programa, atalho `.lnk` ou app da Loja (`shell:AppsFolder\…`), em PNG de `size` pixels.
/// Programas e atalhos usam o ícone guardado no próprio arquivo; o resto (pastas, apps da Loja) usa o da casca do Windows.
#[cfg(windows)]
pub fn icon_png(target: &str, size: i32) -> Option<Vec<u8>> {
    if let Some((file, index)) = icon_source(target) {
        if let Some(png) = resource_png(&file, index, size) {
            return Some(png);
        }
    }
    shell_png(target, size)
}

/// O ícone como a casca do Windows o mostra (o que o Explorer desenha), em PNG.
#[cfg(windows)]
fn shell_png(target: &str, size: i32) -> Option<Vec<u8>> {
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

    /// O ícone de um .exe sai do próprio arquivo (não da miniatura da casca) e é o maior que ele guarda.
    #[cfg(windows)]
    #[test]
    fn extrai_o_icone_guardado_no_exe_e_acha_a_fonte_de_um_atalho() {
        let (file, index) = super::icon_source("C:\\Windows\\System32\\notepad.exe").unwrap();
        assert_eq!((file.as_str(), index), ("C:\\Windows\\System32\\notepad.exe", 0));
        let png = super::resource_png(&file, index, 256).expect("o exe tem ícone");
        assert_eq!(u32::from_be_bytes(png[16..20].try_into().unwrap()), 256);
        assert!(super::icon_source("C:\\Users\\x\\pasta").is_none());
        assert!(super::icon_source("shell:AppsFolder\\Pacote!App").is_none());
    }

    #[test]
    fn alfa_direto_usa_a_mascara_quando_o_bitmap_nao_tem_alfa() {
        // Com alfa: só troca a ordem dos canais. Sem alfa: máscara clara = transparente, escura = opaco.
        assert_eq!(super::bgra_straight_to_rgba(&[10, 20, 30, 200], None), vec![30, 20, 10, 200]);
        let no_alpha = [1, 2, 3, 0, 4, 5, 6, 0];
        let mask = [255, 255, 255, 0, 0, 0, 0, 0];
        assert_eq!(super::bgra_straight_to_rgba(&no_alpha, Some(&mask)), vec![3, 2, 1, 0, 6, 5, 4, 255]);
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
