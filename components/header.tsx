import { MenuIcon } from 'lucide-react';
import Image from 'next/image';

import { Button } from './ui/button';

function Header() {
    return (<header className="flex items-center justify-between bg-background px-5 py-6">
        <Image src="/Logo.svg" alt="Clla StudioBook" width={91} height={24} />
        <Button variant="outline" size="icon">
            <MenuIcon />
        </Button>
    </header>
    );
}

export default Header;