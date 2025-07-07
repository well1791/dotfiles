function e --description 'Edit files with helix/hx'
    if test (uname) = Darwin
        hx $argv
    else if test (uname) = Linux
        helix $argv
    else
        echo "Unsupported operating system."
        return 1
    end
end
