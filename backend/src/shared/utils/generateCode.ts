import { Company } from "@/modules/companies/company.model";

function generateCompanyCode(name: string): string {
    const words = name
        .normalize('NFD')
        .replace(/[^a-zA-Z0-9 ]/g, '')
        .split(' ')
        .filter(Boolean);

    const letters = words
        .slice(0, 3)
        .map(w => w[0])
        .join('')
        .toUpperCase();

    const number = Math.floor(10 + Math.random() * 90);

    return `${letters}${number}`;
}

export async function generateUniqueCompanyCode(companyName: string): Promise<string> {
    if (!companyName) throw new Error("Company name is required");
    const initials = companyName
        .split(' ')
        .map(word => word[0].toUpperCase())
        .join('');
    const randomNumber = Math.floor(Math.random() * 100); // 0-99
    return `${initials}${randomNumber}`;
}
